import { type Parent, type PhrasingContent, type Root, type Text } from 'mdast';
import { type Plugin } from 'unified';
import { visit } from 'unist-util-visit';

import {
  type AutoLinkRule,
  type DetailsNode,
  type MentionMaps,
  type MentionNode,
} from '../types.js';

/**
 * Normalize mixed syntax into a canonical mdast:
 *  - Slack strikethrough: ~text~ -> delete
 *  - Slack angle forms & autolinks -> link/mention nodes
 *  - Linear @user -> link if mapped
 *  - Autolinks (e.g., BOT-123) via rules
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
        if (!parent || isCodeLike(parent)) return;

        const fragments: PhrasingContent[] = [];
        const input = String(node.value ?? '');
        let lastIndex = 0;

        // Composite regex covering several constructs; we will branch inside the loop
        const re =
          /~([^~\s][^~]*?)~|<(?:(?:@([A-Z][A-Z0-9]+))|#([A-Z][A-Z0-9]+)\|([^>]+)|!((?:here|channel|everyone))|([^>|]+?)(?:\|([^>]*))?)>|@([a-zA-Z0-9._-]+)|/g;
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
            // <@U123>
            const mention: MentionNode = {
              type: 'mention',
              data: { subtype: 'user', id: m[2] },
              children: [],
            };
            fragments.push(mention);
          } else if (m[3]) {
            // <#C123|name>
            const mention: MentionNode = {
              type: 'mention',
              data: { subtype: 'channel', id: m[3], label: m[4] },
              children: [],
            };
            fragments.push(mention);
          } else if (m[5]) {
            // <!here> / <!channel> / <!everyone>
            const mention: MentionNode = {
              type: 'mention',
              data: { subtype: 'special', id: m[5] },
              children: [],
            };
            fragments.push(mention);
          } else if (m[6]) {
            // <url|label?> or <url>
            const url = m[6];
            const label = m[7] ?? m[6];
            fragments.push({
              type: 'link',
              url,
              title: null,
              children: [{ type: 'text', value: label }],
            });
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

        // Autolinks (e.g., BOT-123) applied after above to avoid re-processing
        if (fragments.length === 0) {
          // No matches; try autolinks on the original text
          const frags2: PhrasingContent[] = [];
          let s = input;
          for (const rule of autolinks) {
            const tmp: PhrasingContent[] = [];
            s = splitInclusive(
              s,
              rule.pattern,
              (mm) => {
                const url = templ(rule.urlTemplate, mm);
                const label = templ(rule.labelTemplate ?? '$0', mm) || mm[0];
                return {
                  type: 'link',
                  url,
                  title: null,
                  children: [{ type: 'text', value: label }],
                };
              },
              tmp
            );
            if (tmp.length) {
              frags2.push(...tmp);
            } else {
              frags2.push({ type: 'text', value: s });
            }
            // Next rules operate on the concatenated plain text of previous step
            s = frags2.map(valueOf).join('');
          }
          if (frags2.length) {
            fragments.push(...frags2);
          }
        }

        if (
          fragments.length &&
          parent &&
          Array.isArray(parent.children) &&
          typeof index === 'number'
        ) {
          parent.children.splice(index, 1, ...fragments);
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

function valueOf(n: PhrasingContent): string {
  switch (n.type) {
    case 'text':
    case 'inlineCode':
    case 'html':
      return String(n.value ?? '');
    default:
      return '';
  }
}

function splitInclusive(
  input: string,
  re: RegExp,
  toNode: (m: RegExpExecArray) => PhrasingContent | null,
  out: PhrasingContent[]
): string {
  let last = 0;
  re.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input))) {
    if (match.index > last) {
      out.push({ type: 'text', value: input.slice(last, match.index) });
    }
    const node = toNode(match);
    out.push(node ?? { type: 'text', value: match[0] });
    last = re.lastIndex;
  }
  const tail = input.slice(last);
  if (tail) {
    out.push({ type: 'text', value: tail });
  }
  return '';
}
