import { type Content, type Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

import { type AutoLinkRule } from '../types.js';

export function renderLinear(
  ast: unknown,
  opts: {
    allowHtml: string[];
    autolinks: AutoLinkRule[];
    maps: { users?: Record<string, { url: string; label?: string }> };
  }
): string {
  // Clone and normalize: details->+++, strip non-allowed HTML
  const cloned: Root = structuredClone(ast as Root);

  const nextChildren: Content[] = [];
  for (const n of cloned.children ?? []) {
    if (isDetailsNode(n)) {
      nextChildren.push(...detailsToLinear(n));
      continue;
    }
    if (isHtmlNode(n)) {
      if (!isAllowedHtml(n.value ?? '', opts.allowHtml)) continue;
    }
    nextChildren.push(n);
  }
  cloned.children = nextChildren;

  const out = unified()
    .use(remarkStringify, { bullet: '-', fences: true, listItemIndent: 'one' })
    .use(remarkGfm)
    .stringify(cloned);
  return String(out);
}

type DetailsNode = {
  type: 'details';
  data?: { summary?: string };
  children?: Content[];
};
type HtmlNode = { type: 'html'; value?: string } & Content;
function isDetailsNode(n: unknown): n is DetailsNode {
  return Boolean(
    n && typeof n === 'object' && (n as { type?: unknown }).type === 'details'
  );
}
function isHtmlNode(n: unknown): n is HtmlNode {
  return Boolean(
    n && typeof n === 'object' && (n as { type?: unknown }).type === 'html'
  );
}

function detailsToLinear(node: DetailsNode): Content[] {
  const summary = String(node.data?.summary ?? 'Details');
  const inner = toMarkdownChildren(node.children ?? []);
  const txt = `+++ ${summary}\n\n${inner}\n\n+++\n\n`;
  return [{ type: 'paragraph', children: [{ type: 'text', value: txt }] }];
}

export function toMarkdownChildren(children: Content[]): string {
  const root: Root = { type: 'root', children };
  const s = unified().use(remarkStringify).use(remarkGfm).stringify(root);
  return s.trim();
}

export function isAllowedHtml(value: string, allow: string[]): boolean {
  // Extremely small allowlist check: ensure the tag name is in the allow list
  const m = /^<\/?([a-zA-Z]+)(\s|>|\/)/.exec(value.trim());
  if (!m) return false;
  const tag = m[1]?.toLowerCase();
  return allow.includes(tag as string);
}
