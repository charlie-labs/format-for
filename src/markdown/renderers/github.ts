import { type Parent, type Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

import { type DetailsNode, type MentionNode } from '../types.js';

export function renderGithub(ast: Root): string {
  const cloned: Root = structuredClone(ast);

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
      const inner = toMarkdownChildren(node.children);
      const html = `<details>\n<summary>${escapeHtml(summary)}</summary>\n\n${inner}\n</details>`;
      if (typeof index === 'number' && parent) {
        parent.children.splice(index, 1, { type: 'html', value: html });
      }
    }
  );

  return unified()
    .use(remarkStringify, { bullet: '-', fences: true })
    .use(remarkGfm)
    .stringify(cloned);
}

function toMarkdownChildren(children: Root['children']): string {
  return unified()
    .use(remarkStringify)
    .use(remarkGfm)
    .stringify({ type: 'root', children } satisfies Root);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
