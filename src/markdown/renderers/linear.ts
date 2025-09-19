/* eslint-disable no-console */
import { type Html, type Paragraph, type Parent, type Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

import { type DetailsNode, type MentionNode } from '../types.js';

export function renderLinear(ast: Root, opts: { allowHtml: string[] }): string {
  const cloned: Root = structuredClone(ast);

  // Convert custom 'mention' nodes to plain text (Linear has no Slack mentions)
  visit(
    cloned,
    'mention',
    (
      node: MentionNode,
      index: number | undefined,
      parent: Parent | undefined
    ) => {
      let text = '';
      if (node.data?.subtype === 'user') {
        text = node.data.label ? `@${node.data.label}` : '@user';
      } else if (node.data?.subtype === 'channel') {
        text = node.data.label ? `#${node.data.label}` : '#channel';
      } else if (node.data?.subtype === 'special') {
        text = node.data.id ? `@${node.data.id}` : '';
      }
      if (typeof index === 'number' && parent) {
        parent.children.splice(index, 1, { type: 'text', value: text });
      }
    }
  );

  // details -> `+++ Title` then body
  visit(
    cloned,
    'details',
    (
      node: DetailsNode,
      index: number | undefined,
      parent: Parent | undefined
    ) => {
      const title = node.data?.summary ?? 'Details';
      const head: Paragraph = {
        type: 'paragraph',
        children: [{ type: 'text', value: `+++ ${title}` }],
      };
      if (typeof index === 'number' && parent) {
        parent.children.splice(index, 1, head, ...node.children);
      }
    }
  );

  // Normalize allowlist once per render for O(1) lookups
  const allowSet = new Set(opts.allowHtml.map((t) => t.toLowerCase()));

  // Strip disallowed HTML blocks
  visit(
    cloned,
    'html',
    (node: Html, index: number | undefined, parent: Parent | undefined) => {
      if (!node || !parent) return;
      if (!isAllowedHtml(node.value, allowSet)) {
        console.warn('Linear: HTML stripped');
        if (typeof index === 'number') parent.children.splice(index, 1);
      }
    }
  );

  return unified()
    .use(remarkStringify, { bullet: '-', fences: true })
    .use(remarkGfm)
    .stringify(cloned);
}

/**
 * Returns true if the raw HTML `value` only includes elements/declarations present
 * in `allowSet`.
 *
 * Semantics:
 * - Element tags are matched case-insensitively (e.g., `<U>`, `<br/>`).
 * - Declaration-like constructs are treated as synthetic names prefixed with `!`:
 *   - `<!DOCTYPE html>` → `!doctype`
 *   - `<!here>` → `!here`
 *   - `<!-- comment -->` → `!--`
 * - When any present name (element or declaration) is not in the allowlist, the
 *   entire HTML node is disallowed and stripped.
 * - When no tags or declarations are present, the HTML node is treated as a noop
 *   container and allowed.
 */
function isAllowedHtml(value: string, allowSet: ReadonlySet<string>): boolean {
  const s = String(value);

  // Collect all HTML element tag names present in the node's raw HTML.
  // Matches opening/closing/self-closing tags like: <u>, </u>, <br/>, <summary attr="x">.
  const present = new Set<string>();
  const tagPattern = /<\/?\s*([a-zA-Z][\w:-]*)\b[^>]*>/g;
  for (
    let m: RegExpExecArray | null = tagPattern.exec(s);
    m;
    m = tagPattern.exec(s)
  ) {
    const name = m[1];
    if (name) present.add(name.toLowerCase());
  }

  // Also collect declaration-like constructs (e.g., <!here>, <!doctype ...>, <!-- ... -->)
  // Treat them as synthetic tag names that must also be allowed.
  //  - <!here> → "!here"
  //  - <!DOCTYPE html> → "!doctype"
  //  - <!-- comment --> → "!--"
  const declPattern = /<\s*!([^-\s>][^\s>]*)(?:[^>]*)>|<!--/gi;
  for (
    let m: RegExpExecArray | null = declPattern.exec(s);
    m;
    m = declPattern.exec(s)
  ) {
    if (m[0].startsWith('<!--')) {
      present.add('!--');
      continue;
    }
    const raw = m[1] ?? '';
    if (!raw) continue;
    const token = raw.toLowerCase();
    present.add(`!${token}`);
  }

  // No tags or declarations → noop HTML (allow)
  if (present.size === 0) return true;

  // Require that every present name is in the allow list
  for (const name of present) {
    if (!allowSet.has(name)) return false;
  }
  return true;
}
