/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Content, type Text } from 'mdast';
import { type Plugin } from 'unified';
import { SKIP, visit } from 'unist-util-visit';

import { type AutoLinkRule, type MentionMaps } from '../types.js';

type MentionNode = {
  type: 'mention';
  data: { subtype: 'user' | 'channel' | 'special'; id: string; label?: string };
};
type ContentOrMention = Content | MentionNode;

/**
 * Convert '~strike~', '@user' (Linear), Slack angle forms <…> to mdast nodes.
 * Never touches inlineCode/code or link labels.
 */
export const remarkCanonicalizeMixed: Plugin<
  [{ maps?: MentionMaps; autolinks?: AutoLinkRule[] }]
> = (opts = {}) => {
  const autolinks = opts.autolinks ?? [];
  const linearUsers = opts.maps?.linear?.users ?? {};

  return (tree: any) => {
    // 1) Transform Slack angle HTML nodes if present
    visit(
      tree,
      'html',
      (node: unknown, index: number | undefined, parent: unknown) => {
        const p = parent as { children?: ContentOrMention[] } | undefined;
        const nv = (node as { value?: unknown })?.value;
        if (!p || typeof nv !== 'string') return;
        const v: string = nv.trim();
        let replaced: ContentOrMention | null = null;
        // <http://url|text>
        let m = /^<([^|>]+)\|([^>]+)>$/.exec(v);
        if (m && m[1] && m[2]) {
          replaced = {
            type: 'link',
            url: m[1],
            title: null,
            children: [{ type: 'text', value: m[2] }],
          };
        }
        // <http://url>
        if (!replaced) {
          m = /^<([^|>]+)>$/.exec(v);
          if (m && m[1]) {
            replaced = {
              type: 'link',
              url: m[1],
              title: null,
              children: [{ type: 'text', value: m[1] }],
            };
          }
        }
        // <@U12345>
        if (!replaced) {
          m = /^<@([A-Z0-9]+)>$/.exec(v);
          if (m && m[1]) {
            replaced = { type: 'mention', data: { subtype: 'user', id: m[1] } };
          }
        }
        // <!here>
        if (!replaced) {
          m = /^<!([a-z]+)>$/.exec(v);
          if (m && m[1]) {
            replaced = {
              type: 'mention',
              data: { subtype: 'special', id: m[1] },
            };
          }
        }
        // <#C123|dev>
        if (!replaced) {
          m = /^<#([A-Z0-9]+)\|([^>]+)>$/.exec(v);
          if (m && m[1]) {
            replaced = {
              type: 'mention',
              data: { subtype: 'channel', id: m[1], label: m[2] },
            };
          }
        }
        if (
          replaced &&
          typeof index === 'number' &&
          p &&
          Array.isArray(p.children)
        ) {
          p.children.splice(index, 1, replaced);
          return SKIP;
        }
        return undefined;
      }
    );

    // 2) Transform text nodes for ~strike~ and autolinks and Linear @user
    visit(tree, (node: unknown, _idx: number | undefined, parent: unknown) => {
      const p = parent as { children?: ContentOrMention[] } | undefined;
      const nt = (node as { type?: unknown }).type;
      if (!p) return;
      if (nt !== 'text') return;
      // Do not touch if inside code-like
      const ptype = (parent as { type?: unknown })?.type;
      if (ptype === 'inlineCode' || ptype === 'code') return;

      const parts: ContentOrMention[] = [];
      const textVal = (node as Text).value ?? '';
      let rest = String(textVal);

      // a) ~strike~ → delete
      rest = splitInclusive(
        rest,
        /~([^~]+)~/g,
        (m) => ({
          type: 'delete',
          children: [{ type: 'text', value: m[1] ?? '' }],
        }),
        parts
      );

      // b) Linear @user → link (if mapped)
      rest = splitInclusive(
        rest,
        /@([a-zA-Z0-9_.-]+)/g,
        (m) => {
          const key = m[1] ?? '';
          const mapped = linearUsers[key];
          if (!mapped) return null;
          return {
            type: 'link',
            url: mapped.url,
            children: [{ type: 'text', value: mapped.label ?? `@${key}` }],
          } as Content;
        },
        parts
      );

      // c) Autolinks (e.g., BOT-123)
      for (const rule of autolinks) {
        if (!rule.pattern.global) continue; // must be global for iterative splitting
        const prev: ContentOrMention[] = [];
        rest = splitInclusive(
          rest,
          rule.pattern,
          (m) => ({
            type: 'link',
            url: templ(rule.urlTemplate, m),
            children: [
              { type: 'text', value: templ(rule.labelTemplate ?? '$0', m) },
            ],
          }),
          prev
        );
        if (prev.length) {
          parts.push(...prev);
        }
      }

      if (parts.length) {
        if (rest) {
          parts.push({ type: 'text', value: rest });
        }
        const needle = node as ContentOrMention;
        const idx = p.children ? p.children.findIndex((c) => c === needle) : -1;
        if (idx >= 0 && p.children) p.children.splice(idx, 1, ...parts);
        return SKIP;
      }
      return undefined;
    });
  };
};

function templ(tpl: string, m: RegExpExecArray): string {
  return tpl.replace(/\$(\d+)/g, (_, g1) => m[Number(g1)] ?? '');
}

/** Split string by regex; push preceding text and node for each match. */
export function splitInclusive(
  input: string,
  re: RegExp,
  toNode: (m: RegExpExecArray) => ContentOrMention | null,
  out: ContentOrMention[]
): string {
  re.lastIndex = 0;
  let last = 0;
  for (let m = re.exec(input); m; m = re.exec(input)) {
    const start = m.index;
    const end = start + m[0].length;
    if (start > last) {
      out.push({ type: 'text', value: input.slice(last, start) });
    }
    const node = toNode(m);
    if (node) out.push(node);
    else out.push({ type: 'text', value: m[0] });
    last = end;
  }
  return input.slice(last);
}
