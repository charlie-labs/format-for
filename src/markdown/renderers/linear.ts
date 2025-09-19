/* eslint-disable no-console */
import { type Html, type Paragraph, type Parent, type Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { SKIP, visit } from 'unist-util-visit';

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

  // Strip disallowed HTML that appears inside a paragraph by removing the
  // entire paragraph node. This ensures mixed allowed+disallowed HTML does not
  // partially leak through as plain text.
  visit(
    cloned,
    'paragraph',
    (
      node: Paragraph,
      index: number | undefined,
      parent: Parent | undefined
    ) => {
      if (!parent || typeof index !== 'number') return;
      const hasDisallowedHtml = node.children.some((child) => {
        if (child?.type !== 'html') return false;
        const v = String(child.value);
        const tags = extractHtmlTags(v);
        // Only paragraphs containing real, disallowed tags trigger full-paragraph removal
        return tags.size > 0 && !isAllowedHtml(v, opts.allowHtml);
      });
      if (hasDisallowedHtml) {
        console.warn('Linear: HTML paragraph stripped');
        parent.children.splice(index, 1);
        // Continue at the same index so we don't skip the next sibling.
        return [SKIP, index];
      }
    }
  );

  // Also strip disallowed standalone HTML nodes (not inside paragraphs), and
  // strip inline HTML with no real tags (e.g., Slack forms like `<!here>`) while
  // keeping the rest of the paragraph intact.
  visit(
    cloned,
    'html',
    (node: Html, index: number | undefined, parent: Parent | undefined) => {
      if (!node || !parent || typeof index !== 'number') return;
      const v = String(node.value);
      const tags = extractHtmlTags(v);
      const isCommentOrWs = isHtmlCommentOrWhitespace(v);
      // If inside a paragraph with no real tags and not a comment/whitespace, drop just this HTML node (e.g., '<!here>').
      if (parent.type === 'paragraph' && tags.size === 0 && !isCommentOrWs) {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
      // Otherwise, if disallowed (e.g., top-level html with disallowed tags), drop it.
      if (!isAllowedHtml(v, opts.allowHtml)) {
        console.warn('Linear: HTML stripped');
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
    }
  );

  return unified()
    .use(remarkStringify, { bullet: '-', fences: true })
    .use(remarkGfm)
    .stringify(cloned);
}

function isAllowedHtml(value: string, allow: string[]): boolean {
  const s = String(value);
  const tags = extractHtmlTags(s);
  if (tags.size === 0) return isHtmlCommentOrWhitespace(s);

  const allowSet = new Set(allow.map((t) => t.toLowerCase()));
  for (const t of tags) if (!allowSet.has(t)) return false;
  return true;
}

function extractHtmlTags(s: string): Set<string> {
  const tagRe = /<\s*\/?\s*([A-Za-z][\w:-]*)\b[^>]*>/g;
  const tags = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(s))) {
    const name = m[1];
    if (typeof name === 'string') tags.add(name.toLowerCase());
  }
  return tags;
}

function isHtmlCommentOrWhitespace(s: string): boolean {
  const t = s.trim();
  if (t === '') return true;
  // HTML comment(s) only
  // - single: <!-- ... -->
  // - allow surrounding whitespace
  // - multiple adjacent comments: <!-- a --><!-- b -->
  const commentOnly = /^(?:<!--[\s\S]*?-->)+$/;
  return commentOnly.test(t);
}
