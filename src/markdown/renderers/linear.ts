import { type Html, type Paragraph, type Parent, type Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkStringify, {
  type Options as StringifyOptions,
} from 'remark-stringify';
import { unified } from 'unified';
import { SKIP, visit } from 'unist-util-visit';

import {
  type DetailsNode,
  type FormatOptions,
  type MentionNode,
} from '../types.js';
import { fixEmptyTaskItems } from '../utils/tasklist-utils.js';
import { warn } from '../utils/warn.js';

export function renderLinear(
  ast: Root,
  opts: { allowHtml: string[]; warnings?: FormatOptions['warnings'] }
): string {
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
        // Keep literal Slack ID by default when no label/mapping is present
        if (node.data.label) {
          text = `@${node.data.label}`;
        } else if (node.data.id) {
          text = `@${node.data.id}`;
        } else {
          text = '@user';
        }
      } else if (node.data?.subtype === 'channel') {
        if (node.data.label) {
          text = `#${node.data.label}`;
        } else if (node.data.id) {
          text = `#${node.data.id}`;
        } else {
          text = '#channel';
        }
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

  // IMPORTANT: Keep allowed inline HTML even when mixed with disallowed HTML
  // in the same paragraph. We no longer remove the entire paragraph when a
  // disallowed tag appears; instead, we drop only the disallowed HTML nodes.
  //
  // Minor nicety: when a disallowed inline HTML node appears on a new line in
  // the same paragraph (i.e., the preceding sibling text node contains a
  // newline), trim that sibling text back to the last newline so the leftover
  // line label like "Disallowed: " doesn't linger without the tag.
  // The actual removal happens below in the dedicated 'html' visitor.

  // Strip disallowed HTML nodes wherever they appear, and also strip inline
  // HTML with no real tags (e.g., Slack forms like `<!here>`) while keeping the
  // rest of the paragraph intact.
  visit(
    cloned,
    'html',
    (node: Html, index: number | undefined, parent: Parent | undefined) => {
      if (!node || !parent || typeof index !== 'number') return;
      const v = String(node.value);
      // Heuristic: treat angle‑bracket "placeholders" like `<PR_NUMBER>` or
      // `<service-host>` as literal text, not HTML. remark parses these as
      // `html` nodes, but Linear would otherwise drop them as disallowed HTML
      // which causes data loss in prose. We only apply this when the token is
      // a single tag‑like chunk without attributes and with characters that are
      // atypical for real HTML tag names (uppercase letters, digits, `_` or
      // `-`).
      if (parent.type === 'paragraph' && isAnglePlaceholder(v)) {
        parent.children.splice(index, 1, { type: 'text', value: v });
        return [SKIP, index];
      }
      const tags = extractHtmlTags(v);
      const isCommentOrWs = isHtmlCommentOrWhitespace(v);
      // If inside a paragraph with no real tags and not a comment/whitespace, drop just this HTML node (e.g., '<!here>').
      if (parent.type === 'paragraph' && tags.size === 0 && !isCommentOrWs) {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
      // Otherwise, if disallowed (e.g., top-level html with disallowed tags), drop it.
      if (!isAllowedHtml(v, opts.allowHtml)) {
        warn('Linear: HTML stripped', opts.warnings);

        // If we're inside a paragraph and the previous sibling is text, we may
        // need to trim back to the last newline — but only when the stripped
        // HTML actually starts on a new line. Concretely, if the previous text
        // ends at a newline (or only whitespace after the final newline), then
        // trimming is safe. Otherwise, do not trim, or we'd delete content on
        // the same line.
        if (parent.type === 'paragraph') {
          const prev = parent.children[index - 1];
          if (prev && prev.type === 'text') {
            const val = String(prev.value);
            const nl = val.lastIndexOf('\n');
            const tail = nl === -1 ? '' : val.slice(nl + 1);
            // Only trim when everything after the last newline is whitespace.
            if (nl !== -1 && /^\s*$/.test(tail)) {
              const trimmed = val.slice(0, nl);
              if (trimmed.length === 0) {
                // Remove the prev text node entirely
                parent.children.splice(index - 1, 1);
                // Adjust our index because we've removed the previous sibling
                index -= 1;
              } else {
                prev.value = trimmed;
              }
            }
          }
        }

        // If this disallowed HTML is an opening tag, also remove everything up
        // to its matching closing tag so inner text like 'nope()' does not
        // leak through (remark splits `<script>nope()</script>` into
        // '<script>', 'nope()', '</script>').
        const openName = openingTagName(v);
        const closeName = closingTagName(v);
        if (openName && !closeName) {
          let j = index + 1;
          let depth = 1;
          for (; j < parent.children.length; j++) {
            const sib = parent.children[j];
            if (!sib || sib.type !== 'html') continue;
            const sv = String(sib.value);
            if (openingTagName(sv) === openName) depth++;
            if (closingTagName(sv) === openName) {
              depth--;
              if (depth === 0) break;
            }
          }
          if (depth === 0) {
            parent.children.splice(index, j - index + 1);
            return [SKIP, index];
          }
        }

        parent.children.splice(index, 1);
        return [SKIP, index];
      }
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

  const out = unified()
    .use(remarkStringify, stringifyOpts)
    .use(remarkGfm)
    .stringify(cloned);

  return fixEmptyTaskItems(cloned, out);
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

function openingTagName(s: string): string | null {
  const m = /^<\s*([A-Za-z][\w:-]*)\b/.exec(s);
  if (!m) return null;
  // Ensure not a closing tag
  if (/^<\s*\//.test(s)) return null;
  const name = m[1] ?? null;
  return name ? name.toLowerCase() : null;
}

function closingTagName(s: string): string | null {
  const m = /^<\s*\/\s*([A-Za-z][\w:-]*)\b/.exec(s);
  const name = m && m[1] ? m[1] : null;
  return name ? name.toLowerCase() : null;
}

// shared util imported

// ——— helpers ———

// Detect single angle‑bracket placeholders like `<PR_NUMBER>` or `<service-host>`.
// Conditions:
//  - The value consists of exactly one tag‑like token with no attributes
//  - The name contains chars uncommon for real HTML tags (uppercase, digits, '_' or '-')
//  - Not a closing tag/comment/processing instruction
function isAnglePlaceholder(s: string): boolean {
  const t = String(s).trim();
  // Reject closing tags / comments / processing instructions fast
  if (t.startsWith('</') || t.startsWith('<!--') || t.startsWith('<?')) {
    return false;
  }
  // Accept exactly one non-whitespace, non-`/` token between '<' and '>'
  const m = /^<\s*([^\s/>]+)\s*>$/.exec(t);
  if (!m) return false;
  const name = m[1] ?? '';
  // Placeholder if it includes uncommon characters or uppercase letters
  if (/[A-Z]/.test(name)) return true;
  if (/[0-9_\-]/.test(name)) return true;
  // Otherwise, likely a real HTML tag like <div>, <video>, etc.
  return false;
}
