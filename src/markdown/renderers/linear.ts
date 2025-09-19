/* eslint-disable no-console */
import { type Html, type Paragraph, type Parent, type Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

import { type DetailsNode, type MentionNode } from '../types.js';

export function renderLinear(ast: Root, opts: { allowHtml: string[] }): string {
  const cloned: Root = structuredClone(ast);

  // Convert custom 'mention' nodes to plain text (Linear has no Slack mentions)
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
        text = node.data.label ? `@${node.data.label}` : '@user';
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

  // details -> `+++ Title` then body
  visit(
    cloned,
    'details',
    (
      node: DetailsNode,
      index: number | undefined,
      parent: Parent | undefined
    ) => {
      const title = node.data?.summary ?? 'Details';
      const head: Paragraph = {
        type: 'paragraph',
        children: [{ type: 'text', value: `+++ ${title}` }],
      };
      if (typeof index === 'number' && parent) {
        parent.children.splice(index, 1, head, ...node.children);
      }
    }
  );

  // Strip disallowed HTML blocks
  visit(
    cloned,
    'html',
    (node: Html, index: number | undefined, parent: Parent | undefined) => {
      if (!node || !parent) return;
      if (!isAllowedHtml(node.value, opts.allowHtml)) {
        console.warn('Linear: HTML stripped');
        if (typeof index === 'number') parent.children.splice(index, 1);
      }
    }
  );

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
