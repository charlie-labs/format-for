/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Plugin } from 'unified';
import { visit } from 'unist-util-visit';

import { type AutoLinkRule, type MentionMaps } from '../types.js';

/**
 * Normalize mixed syntax into a canonical mdast:
 *  - Slack strikethrough: ~text~ -> delete
 *  - Slack angle forms & autolinks -> link/mention nodes
 *  - Linear @user -> link if mapped
 *  - Autolinks (e.g., BOT-123) via rules
 *  - Linear collapsible: paragraph starting with '+++ ' -> details node with next block as body
 */
export const remarkCanonicalizeMixed: Plugin<
  [{ maps?: MentionMaps; autolinks?: AutoLinkRule[] }]
> = (opts = {}) => {
  const pluginOpts = opts as { maps?: MentionMaps; autolinks?: AutoLinkRule[] };
  const maps = pluginOpts.maps ?? {};
  const linearUsers = maps.linear?.users ?? {};
  const autolinks = pluginOpts.autolinks ?? [];

  return (tree: any) => {
    // 1) Block-level: '+++ Title' → details
    const root = tree as { children?: any[] };
    if (Array.isArray(root.children)) {
      for (let i = 0; i < root.children.length; i++) {
        const n: any = root.children[i];
        if (
          n.type === 'paragraph' &&
          n.children?.length === 1 &&
          (n.children as any[])[0]?.type === 'text'
        ) {
          const m = /^\+\+\+\s+(.+)/.exec(
            String((n.children as any[])[0]?.value ?? '')
          );
          if (m) {
            const title = (m[1] || '').trim();
            const body: any[] = [];
            // Pull the next sibling as the body if present and not another '+++' header
            const next: any = root.children[i + 1];
            if (
              next &&
              !(
                next.type === 'paragraph' &&
                next.children?.[0]?.value?.startsWith('+++ ')
              )
            ) {
              body.push(next);
              root.children.splice(i + 1, 1);
            }
            // Replace current node with details
            root.children.splice(i, 1, {
              type: 'details',
              data: { summary: title },
              children: body,
            });
          }
        }
      }
    }

    // 2) Inline text normalization
    visit(
      tree,
      'text',
      (node: any, _index: number | undefined, parent: any) => {
        if (!parent || isCodeLike(parent)) return;

        const fragments: any[] = [];
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
            fragments.push({
              type: 'mention',
              data: { subtype: 'user', id: m[2] },
              children: [],
            });
          } else if (m[3]) {
            // <#C123|name>
            fragments.push({
              type: 'mention',
              data: { subtype: 'channel', id: m[3], label: m[4] },
            });
          } else if (m[5]) {
            // <!here> / <!channel> / <!everyone>
            fragments.push({
              type: 'mention',
              data: { subtype: 'special', id: m[5] },
            });
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
          const frags2: any[] = [];
          let s = input;
          for (const rule of autolinks) {
            const tmp: any[] = [];
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
            s = frags2.map((n) => ('value' in n ? n.value : '')).join('');
          }
          if (frags2.length) {
            fragments.push(...frags2);
          }
        }

        if (fragments.length && parent) {
          const p: any = parent;
          if (Array.isArray(p.children)) {
            const idx = p.children.indexOf(node);
            p.children.splice(idx, 1, ...fragments);
          }
        }
      }
    );
  };
};

function isCodeLike(node: any): boolean {
  return node.type === 'inlineCode' || node.type === 'code';
}

function templ(tpl: string, m: RegExpExecArray): string {
  return tpl.replace(/\$(\d+)/g, (_, g1) => m[Number(g1)] ?? '');
}

function splitInclusive(
  input: string,
  re: RegExp,
  toNode: (m: RegExpExecArray) => any | null,
  out: any[]
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
