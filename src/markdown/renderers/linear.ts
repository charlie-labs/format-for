/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

export function renderLinear(ast: any, opts: { allowHtml: string[] }): string {
  const cloned = structuredClone(ast);

  // Convert custom 'mention' nodes to plain text (Linear has no Slack mentions)
  visit(
    cloned,
    'mention',
    (node: any, index: number | undefined, parent: any) => {
      const d = node.data || {};
      let text = '';
      if (d.subtype === 'user') {
        text = d.label ? `@${d.label}` : '@user';
      } else if (d.subtype === 'channel') {
        text = d.label ? `#${d.label}` : '#channel';
      } else if (d.subtype === 'special') {
        text = d.id ? `@${d.id}` : '';
      }
      if (typeof index === 'number') {
        parent.children.splice(index, 1, { type: 'text', value: text });
      }
    }
  );

  // details -> `+++ Title` then body
  visit(
    cloned,
    'details',
    (node: any, index: number | undefined, parent: any) => {
      const title = node.data?.summary ?? 'Details';
      const head = {
        type: 'paragraph',
        children: [{ type: 'text', value: `+++ ${title}` }],
      };
      if (typeof index === 'number') {
        parent.children.splice(
          index,
          1,
          head,
          ...((node.children as any[]) ?? [])
        );
      }
    }
  );

  // Strip disallowed HTML blocks
  visit(cloned, 'html', (node: any, index: number | undefined, parent: any) => {
    if (!node || !parent) return;
    if (!isAllowedHtml(node.value, opts.allowHtml)) {
      console.warn('Linear: HTML stripped');
      if (typeof index === 'number') parent.children.splice(index, 1);
    }
  });

  return unified()
    .use(remarkStringify, { bullet: '-', fences: true })
    .use(remarkGfm)
    .stringify(cloned);
}

function isAllowedHtml(value: string, allow: string[]): boolean {
  return allow.some((tag) =>
    new RegExp(`<\\/?${tag}\\b`, 'i').test(String(value))
  );
}
