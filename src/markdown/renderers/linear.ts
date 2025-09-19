/* eslint-disable no-console */
import { type Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

import { type AutoLinkRule, type MentionMaps } from '../types.js';

export interface LinearRenderOptions {
  allowHtml: ('details' | 'summary' | 'u' | 'sub' | 'sup' | 'br')[];
  autolinks: AutoLinkRule[];
  maps: NonNullable<MentionMaps['linear']>;
}

export function renderLinear(ast: Root, opts: LinearRenderOptions): string {
  // First, stringify GFM as a base
  let s = unified().use(remarkGfm).use(remarkStringify).stringify(ast);

  // Convert <details><summary>Title</summary>…</details> ➜ +++ Title … +++
  s = s.replace(
    /<details\b[^>]*>\s*<summary>([\s\S]*?)<\/summary>\s*([\s\S]*?)<\/details>/gim,
    (_m, summary: string, body: string) => {
      const title = stripHtml(summary).trim();
      const content = body.trim();
      return `+++ ${title}\n${content}\n+++`;
    }
  );

  // Strip disallowed HTML tags; keep allowlist
  const allow = new Set<string>(opts.allowHtml.map((t) => t as string));
  s = s.replace(
    /<([a-zA-Z0-9-]+)(\s[^>]*?)?>[\s\S]*?<\/\1>/g,
    (m, tag: string) => {
      if (allow.has(tag)) return m; // keep
      // Otherwise strip entirely
      console.warn(`Linear: stripped HTML <${tag}>`);
      return '';
    }
  );

  // Self-closing disallowed tags
  s = s.replace(/<([a-zA-Z0-9-]+)(\s[^>]*?)?\/>/g, (m, tag: string) => {
    if (allow.has(tag)) return m;
    console.warn(`Linear: stripped HTML <${tag}/>`);
    return '';
  });

  // Autolink rules (naive: outside of code blocks is not guaranteed here)
  for (const rule of opts.autolinks) {
    const labelTemplate = rule.labelTemplate ?? '$0';
    s = s.replace(rule.pattern, (match, ...args) => {
      const groups = args.slice(0, args.length - 2) as string[]; // last two are offset & input
      const mk = (tpl: string) =>
        tpl.replace(/\$(\d+)/g, (_m2, n: string) =>
          n === '0' ? match : (groups[Number(n) - 1] ?? '')
        );
      const url = mk(rule.urlTemplate);
      const label = mk(labelTemplate);
      return `[${label}](${url})`;
    });
  }

  // Map Linear user mentions: @user => [Label](url)
  if (opts.maps?.users) {
    const map = opts.maps.users;
    s = s.replace(
      /(^|\W)@([a-zA-Z0-9._-]+)\b/g,
      (m, pre: string, uname: string) => {
        const info = map[uname];
        if (!info) return m;
        const label = info.label ?? uname;
        return `${pre}[${label}](${info.url})`;
      }
    );
  }

  return s;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}
