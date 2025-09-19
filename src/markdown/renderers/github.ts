import { type Html, type Parent, type Root } from 'mdast';
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
      // Convert any nested details inside the body to HTML first, then stringify
      // the body so remark doesn't encounter unknown `details` nodes.
      convertNestedDetails(node.children);
      const inner = toMarkdownChildren(node.children).trim();
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

function convertNestedDetails(children: Root['children']): void {
  for (let i = 0; i < children.length; i++) {
    const n = children[i];
    if (!n) continue;
    if (n.type === 'details') {
      // Recursively convert inside first
      convertNestedDetails(n.children);
      const summary =
        (typeof n.data?.summary === 'string' ? n.data.summary : undefined) ??
        'Details';
      const inner = toMarkdownChildren(n.children).trim();
      const value = `<details>\n<summary>${escapeHtml(summary)}</summary>\n\n${inner}\n</details>`;
      children.splice(i, 1, { type: 'html', value } as Html);
      continue;
    }
    if (hasChildren(n)) {
      convertNestedDetails(n.children);
    }
  }
}

function hasChildren(n: unknown): n is { children: unknown[] } {
  return (
    !!n &&
    typeof n === 'object' &&
    Array.isArray((n as { children?: unknown }).children)
  );
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
