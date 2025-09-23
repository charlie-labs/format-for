import { type Html, type Parent, type Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkStringify, {
  type Options as RemarkStringifyOptions,
} from 'remark-stringify';
import { unified } from 'unified';
import { SKIP, visit } from 'unist-util-visit';

import {
  type DetailsNode,
  type FormatOptions,
  type MentionNode,
} from '../types.js';
import { fixEmptyTaskItems } from '../utils/tasklist-utils.js';

export function renderGithub(ast: Root, options?: FormatOptions): string {
  const cloned: Root = structuredClone(ast);
  const stringifyOptions = buildStringifyOptions(options);

  // Convert custom 'mention' nodes to plain text (GitHub has no native support)
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
        text = node.data.label
          ? `@${node.data.label}`
          : `@${node.data.id ?? 'user'}`;
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

  // Transform 'details' nodes → HTML block
  visit(
    cloned,
    'details',
    (
      node: DetailsNode,
      index: number | undefined,
      parent: Parent | undefined
    ) => {
      const summary = node.data?.summary ?? 'Details';
      // Convert any nested details inside the body to HTML first, then stringify
      // the body so remark doesn't encounter unknown `details` nodes.
      convertNestedDetails(node.children, stringifyOptions);
      const inner = trimTrailingNewlines(
        toMarkdownChildren(node.children, stringifyOptions)
      );
      const html = `<details>\n<summary>${escapeHtml(summary)}</summary>\n\n${inner}\n</details>`;
      if (typeof index === 'number' && parent) {
        const htmlNode: Html = { type: 'html', value: html };
        parent.children.splice(index, 1, htmlNode);
      }
    }
  );

  const out = unified()
    // Register GFM extensions before stringify so the compiler picks them up
    .use(remarkGfm)
    .use(remarkStringify, stringifyOptions)
    .stringify(cloned);

  // Preserve empty task list item state like "- [x]"/"- [ ]" on bare marker lines
  return fixEmptyTaskItems(cloned, out);
}

function convertNestedDetails(
  children: Root['children'],
  stringifyOptions: RemarkStringifyOptions
): void {
  // Visit a synthetic root that wraps the provided children and transform
  // any nested `details` nodes in-place without manual casts.
  const root: Root = { type: 'root', children };
  visit(root, 'details', (n: DetailsNode, index, parent) => {
    if (typeof index !== 'number' || !parent) return;
    // Ensure inner details are converted first so stringify doesn't see
    // unknown `details` nodes in the body.
    convertNestedDetails(n.children, stringifyOptions);
    const summary =
      (typeof n.data?.summary === 'string' ? n.data.summary : undefined) ??
      'Details';
    const inner = trimTrailingNewlines(
      toMarkdownChildren(n.children, stringifyOptions)
    );
    const value = `<details>\n<summary>${escapeHtml(summary)}</summary>\n\n${inner}\n</details>`;
    const htmlNode: Html = { type: 'html', value };
    parent.children.splice(index, 1, htmlNode);
    return SKIP; // we've handled this subtree; avoid re-traversal
  });
}

function toMarkdownChildren(
  children: Root['children'],
  stringifyOptions: RemarkStringifyOptions
): string {
  return unified()
    .use(remarkGfm)
    .use(remarkStringify, stringifyOptions)
    .stringify({ type: 'root', children } satisfies Root);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function trimTrailingNewlines(s: string): string {
  return s.replace(/\n+$/, '');
}

function buildStringifyOptions(
  options?: FormatOptions
): RemarkStringifyOptions {
  // Prefer two-space breaks by default; allow a single backslash alternative.
  const style = options?.target?.github?.breaks ?? 'two-spaces';
  return {
    bullet: '-',
    fences: true,
    handlers: {
      break() {
        // backslash style: a single backslash followed by a newline
        return style === 'backslash' ? '\\\n' : '  \n';
      },
    },
  } satisfies RemarkStringifyOptions;
}
