import { type Parent, type PhrasingContent, type Root, type Text } from 'mdast';
import { type Plugin } from 'unified';
import { visit } from 'unist-util-visit';

import {
  type AutoLinkRule,
  type DetailsNode,
  type MentionMaps,
} from '../types.js';

/**
 * Normalize mixed syntax into a canonical mdast:
 *  - Slack strikethrough: ~text~ -> delete
 *  - Slack angle forms (<@U…>, <#C…|…>, <!here>, <url|label>) are preserved as literal text
 *  - Linear @user -> link if mapped via `maps.linear.users`
 *  - Autolinks (e.g., BOT-123) via rules (left-to-right, never inside existing links)
 *  - Linear collapsible: paragraph starting with '+++ ' -> details node with next block as body
 */
export type CanonicalizeOptions = {
  maps?: MentionMaps;
  autolinks?: AutoLinkRule[];
};

export const remarkCanonicalizeMixed: Plugin<[CanonicalizeOptions?], Root> = (
  opts?: CanonicalizeOptions
) => {
  const maps = opts?.maps ?? {};
  const linearUsers = maps.linear?.users ?? {};
  const autolinks = opts?.autolinks ?? [];

  return (root: Root) => {
    // 1) Block-level: '+++ Title' → details
    for (let i = 0; i < root.children.length; i++) {
      const node = root.children[i];
      if (!node) continue;
      if (node.type !== 'paragraph') continue;
      const p = node;
      if (p.children.length !== 1 || p.children[0]?.type !== 'text') continue;
      const first = p.children[0];
      const text = String(
        (first && first.type === 'text' ? first.value : '') ?? ''
      );
      const m = /^\+\+\+\s+(.+)/.exec(text);
      if (!m) continue;
      const title = (m[1] || '').trim();
      const body: Root['children'] = [];
      const next = root.children[i + 1];
      if (
        next &&
        !(
          next.type === 'paragraph' &&
          next.children?.[0]?.type === 'text' &&
          String(
            (next.children[0].type === 'text' ? next.children[0].value : '') ??
              ''
          ).startsWith('+++ ')
        )
      ) {
        body.push(next);
        root.children.splice(i + 1, 1);
      }
      const details: DetailsNode = {
        type: 'details',
        data: { summary: title },
        children: body,
      };
      root.children.splice(i, 1, details);
    }

    // 2) Inline text normalization
    visit(
      root,
      'text',
      (node: Text, index: number | undefined, parent: Parent | undefined) => {
        // Skip if there's no parent or we're inside an existing link/label node
        if (
          !parent ||
          parent.type === 'link' ||
          // Avoid autolinking within reference-style link labels as well
          (parent as { type: string }).type === 'linkReference' ||
          isCodeLike(parent)
        ) {
          return;
        }

        const fragments: PhrasingContent[] = [];
        const input = String(node.value ?? '');
        let lastIndex = 0;

        // Composite regex covering several constructs; we will branch inside the loop
        const re =
          /~([^~\s][^~]*?)~|<(?:(?:@([A-Z][A-Z0-9]+))|#([A-Z][A-Z0-9]+)\|([^>]+)|!((?:here|channel|everyone))|([^>|]+?)(?:\|([^>]*))?)>|@([a-zA-Z0-9._-]+)/g;
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(input))) {
          if (m.index === lastIndex && m[0] === '') break; // safety for trailing |
          if (m.index > lastIndex) {
            fragments.push({
              type: 'text',
              value: input.slice(lastIndex, m.index),
            });
          }
          const [whole] = m;

          if (m[1]) {
            // ~strike~
            fragments.push({
              type: 'delete',
              children: [{ type: 'text', value: m[1] }],
            });
          } else if (m[2]) {
            // <@U123> — keep literal for cross-target fidelity
            fragments.push({ type: 'text', value: whole });
          } else if (m[3]) {
            // <#C123|name> — keep literal
            fragments.push({ type: 'text', value: whole });
          } else if (m[5]) {
            // <!here> / <!channel> / <!everyone> — keep literal
            fragments.push({ type: 'text', value: whole });
          } else if (m[6]) {
            // <url|label?> or <url> — keep literal
            fragments.push({ type: 'text', value: whole });
          } else if (m[8]) {
            // @user (Linear mapping)
            const key = m[8];
            const hit = linearUsers[key];
            if (hit?.url) {
              fragments.push({
                type: 'link',
                url: hit.url,
                title: null,
                children: [{ type: 'text', value: hit.label ?? `@${key}` }],
              });
            } else {
              fragments.push({ type: 'text', value: whole });
            }
          }
          lastIndex = re.lastIndex;
        }

        // Push trailing text that follows the last match
        if (lastIndex < input.length) {
          fragments.push({ type: 'text', value: input.slice(lastIndex) });
        }

        // If nothing matched above, treat the entire node as a single text fragment
        if (fragments.length === 0) {
          fragments.push({ type: 'text', value: input });
        }

        // Apply autolinks to each plain-text fragment via a single left-to-right scan
        const finalFrags: PhrasingContent[] = [];
        for (const frag of fragments) {
          if (frag.type === 'text' && autolinks.length) {
            finalFrags.push(
              ...applyAutolinksLeftToRight(frag.value ?? '', autolinks)
            );
          } else {
            finalFrags.push(frag);
          }
        }

        if (
          finalFrags.length &&
          parent &&
          Array.isArray(parent.children) &&
          typeof index === 'number'
        ) {
          parent.children.splice(index, 1, ...finalFrags);
        }
      }
    );
  };
};

function isCodeLike(_node: Parent): boolean {
  // Text nodes never appear under `code`/`inlineCode` (they are Literals),
  // so this is effectively a no-op guard to mirror previous behavior.
  return false;
}

function templ(tpl: string, m: RegExpExecArray): string {
  return tpl.replace(/\$(\d+)/g, (_, g1) => m[Number(g1)] ?? '');
}

/**
 * Autolink precedence: pick the earliest next match across all rules; ties
 * are resolved by rule array order. Advances the cursor by the matched length
 * and never duplicates or drops intervening text.
 */
function applyAutolinksLeftToRight(
  input: string,
  rules: AutoLinkRule[]
): PhrasingContent[] {
  if (!input) return [];
  const out: PhrasingContent[] = [];
  let pos = 0;
  const len = input.length;

  // Pre-clone regexes so we never mutate caller-provided instances
  const regs = rules.map(
    (r) => new RegExp(r.pattern.source, ensureGlobalFlag(r.pattern.flags))
  );

  while (pos < len) {
    let bestIdx = -1;
    let bestRule = -1;
    let bestMatch: RegExpExecArray | null = null;

    for (let i = 0; i < regs.length; i++) {
      const re = regs[i];
      if (!re) continue;
      re.lastIndex = pos;
      const m = re.exec(input);
      if (!m) continue;
      if (m.index < pos) continue; // defensive; shouldn't happen with lastIndex
      if (bestIdx === -1 || m.index < bestIdx) {
        bestIdx = m.index;
        bestRule = i;
        bestMatch = m;
      }
    }

    if (!bestMatch || bestRule === -1 || bestIdx === -1) {
      // No more matches; emit tail
      if (pos < len) out.push({ type: 'text', value: input.slice(pos) });
      break;
    }

    // Emit intervening text
    if (bestIdx > pos) {
      out.push({ type: 'text', value: input.slice(pos, bestIdx) });
    }

    // Emit link
    const rule = rules[bestRule];
    if (!rule) {
      // Defensive: if rule is missing, emit the tail as plain text
      if (pos < len) out.push({ type: 'text', value: input.slice(pos) });
      break;
    }
    const url = templ(rule.urlTemplate, bestMatch);
    const label = templ(rule.labelTemplate ?? '$0', bestMatch) || bestMatch[0];

    if (bestMatch[0].length === 0) {
      // Avoid infinite loop on zero-length matches: pass through one char
      out.push({ type: 'text', value: input[pos] ?? '' });
      pos += 1;
      continue;
    }

    out.push({
      type: 'link',
      url,
      title: null,
      children: [{ type: 'text', value: label }],
    });

    pos = bestIdx + bestMatch[0].length;
  }

  return out;
}

function ensureGlobalFlag(flags: string): string {
  return flags.includes('g') ? flags : `${flags}g`;
}
