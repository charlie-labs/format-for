import { type Html, type Paragraph, type Parent, type Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkStringify, {
  type Options as StringifyOptions,
} from 'remark-stringify';
import { unified } from 'unified';
import { SKIP, visit } from 'unist-util-visit';

import { type DetailsNode, type MentionNode } from '../types.js';
import { sanitizeForLinear } from '../utils/html.js';

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

  // details -> `+++ Title` then body then closing `+++`
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
        const tail: Paragraph = {
          type: 'paragraph',
          children: [{ type: 'text', value: '+++' }],
        };
        parent.children.splice(index, 1, head, ...node.children, tail);
      }
    }
  );

  // Sanitize HTML nodes in-place:
  // - Inline HTML with no real tags (e.g., Slack '<!here>'): drop the node
  // - Allowed tags preserved; attributes stripped; disallowed tags unwrapped
  // - script/style contents removed entirely
  visit(cloned, 'paragraph', (p) => {
    // Drop inline text that appears between <script>...</script> or <style>...</style>
    // pairs that were parsed into html/text/html siblings.
    const out: Paragraph['children'] = [];
    let skip: 'script' | 'style' | null = null;
    for (const child of p.children) {
      if (skip) {
        if (child.type === 'html') {
          const raw = String(child.value ?? '');
          const close = new RegExp(`^\\s*</${skip}\\s*>\\s*$`, 'i');
          if (close.test(raw)) skip = null;
        }
        continue;
      }
      if (child.type === 'html') {
        const raw = String(child.value ?? '');
        if (/^<script\b[^>]*>$/i.test(raw)) {
          skip = 'script';
          continue;
        }
        if (/^<style\b[^>]*>$/i.test(raw)) {
          skip = 'style';
          continue;
        }
      }
      out.push(child);
    }
    p.children = out;
  });

  // Sanitize HTML nodes in-place:
  // - Inline HTML with no real tags (e.g., Slack '<!here>'): drop the node
  // - Allowed tags preserved; attributes stripped; disallowed tags unwrapped
  // - script/style contents removed entirely
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
      // Otherwise, sanitize for Linear and keep content.
      const res = sanitizeForLinear(v, opts.allowHtml);
      if (res.kind === 'empty') {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
      if (res.kind === 'text') {
        if (parent.type === 'paragraph') {
          parent.children.splice(index, 1, { type: 'text', value: res.value });
        } else {
          parent.children.splice(index, 1, {
            type: 'paragraph',
            children: [{ type: 'text', value: res.value }],
          });
        }
        return [SKIP, index];
      }
      // For inline contexts (paragraph phrasing), replace sanitized HTML with a text node
      // so remark-stringify doesn't reflow/split inline tags. This intentionally renders
      // the literal tag text in Linear.
      if (parent.type === 'paragraph') {
        parent.children.splice(index, 1, { type: 'text', value: res.value });
        return [SKIP, index];
      }
      node.value = res.value; // kind === 'html' (block or other contexts)
    }
  );

  const stringifyOpts: StringifyOptions = {
    bullet: '-',
    fences: true,
    // Use Markdown hard break with two spaces (not backslash) for cleaner raw output.
    handlers: {
      break() {
        return '  \n';
      },
    },
  };

  return unified()
    .use(remarkStringify, stringifyOpts)
    .use(remarkGfm)
    .stringify(cloned);
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
