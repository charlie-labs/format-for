/* eslint-disable @typescript-eslint/no-explicit-any */
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

export function renderGithub(ast: any): string {
  const cloned = structuredClone(ast);

  // Convert custom 'mention' nodes to plain text (GitHub has no native support)
  visit(
    cloned,
    'mention',
    (node: any, index: number | undefined, parent: any) => {
      const d = node.data || {};
      let text = '';
      if (d.subtype === 'user') {
        text = d.label ? `@${d.label}` : `@${d.id ?? 'user'}`;
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

  // Transform 'details' nodes → HTML block
  visit(
    cloned,
    'details',
    (node: any, index: number | undefined, parent: any) => {
      const summary = node.data?.summary ?? 'Details';
      const inner = toMarkdownChildren(node.children ?? []);
      const html = `<details>\n<summary>${escapeHtml(summary)}</summary>\n\n${inner}\n</details>`;
      if (typeof index === 'number') {
        parent.children.splice(index, 1, { type: 'html', value: html });
      }
    }
  );

  return unified()
    .use(remarkStringify, { bullet: '-', fences: true })
    .use(remarkGfm)
    .stringify(cloned);
}

function toMarkdownChildren(children: any[]): string {
  return unified()
    .use(remarkStringify)
    .use(remarkGfm)
    .stringify({ type: 'root', children });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
