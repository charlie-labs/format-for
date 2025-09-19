import { toHtml } from 'hast-util-to-html';
import { toText } from 'hast-util-to-text';
import rehypeParse from 'rehype-parse';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

const base = unified().use(rehypeParse, { fragment: true });

/**
 * Convert an arbitrary HTML fragment into plain text suitable for Slack.
 * - Drops dangerous nodes (script/style) and attributes via sanitize.
 * - Decodes entities (handled by the HTML parser).
 * - Converts <br> to newlines using whitespace: 'pre'.
 */
export function htmlFragmentToText(html: string): string {
  const tree = base.parse(String(html ?? ''));
  // Remove dangerous nodes (script/style) entirely before text extraction.
  stripDangerous(tree as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  // Default schema is conservative: drops unknown tags, keeps text.
  const clean = unified()
    .use(rehypeSanitize)
    .runSync(tree as any) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return toText(clean, { whitespace: 'pre' });
}

export type LinearSanitized =
  | { kind: 'empty'; value: '' }
  | { kind: 'text'; value: string }
  | { kind: 'html'; value: string };

/**
 * Sanitize an HTML fragment for Linear with a minimal allowlist.
 * - Only the provided tag names are allowed; all attributes are stripped.
 * - Disallowed elements are unwrapped (children/text preserved).
 * - Comments are preserved (allowComments: true).
 * - Dangerous nodes (script/style) are removed entirely.
 *
 * Returns either an HTML fragment (when any tags/comments remain),
 * plain text (when only text remains), or empty when nothing remains.
 */
export function sanitizeForLinear(
  html: string,
  allow: string[]
): LinearSanitized {
  const raw = base.parse(String(html ?? '')) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const allowSet = new Set((allow ?? []).map((t) => t.toLowerCase()));

  // Transform the HAST tree in-place:
  // - Drop <script>/<style> and their contents
  // - Unwrap disallowed elements (keep children)
  // - Strip all attributes on allowed elements
  stripDangerous(raw);
  unwrapAndStrip(raw, allowSet);

  const asHtml = toHtml(raw, { allowParseErrors: true });
  const trimmed = asHtml.trim();
  if (trimmed === '') return { kind: 'empty', value: '' };
  // If any markup-like form remains (tags or comments), return HTML; otherwise text.
  const looksLikeMarkup = /<[^>]+>/.test(trimmed);
  if (looksLikeMarkup) return { kind: 'html', value: trimmed };
  return { kind: 'text', value: toText(raw, { whitespace: 'pre' }) };
}

// Remove script/style elements entirely (including their children)
function stripDangerous(tree: any): void {
  visit(tree, 'element', (node: any, index: number | undefined, parent: any) => {
    if (!parent || typeof index !== 'number') return;
    const name = String(node.tagName || '').toLowerCase();
    if (name === 'script' || name === 'style') {
      parent.children.splice(index, 1);
      return [visit.SKIP, index];
    }
    return undefined;
  });
}

// For non-dangerous elements, unwrap disallowed tags and drop attributes on allowed ones.
function unwrapAndStrip(tree: any, allow: Set<string>): void {
  function sanitizeNodes(nodes: any[]): any[] {
    const out: any[] = [];
    for (const n of nodes) {
      if (!n) continue;
      if (n.type === 'element') {
        const name = String(n.tagName || '').toLowerCase();
        // script/style already handled by stripDangerous
        const children = Array.isArray(n.children) ? sanitizeNodes(n.children) : [];
        if (allow.has(name)) {
          out.push({ type: 'element', tagName: name, properties: {}, children });
        } else {
          // unwrap: append children
          out.push(...children);
        }
      } else if (n.type === 'comment' || n.type === 'text') {
        out.push(n);
      } else if (Array.isArray(n.children)) {
        // Generic parent: sanitize its children recursively
        const kids = sanitizeNodes(n.children);
        out.push({ ...n, children: kids });
      } else {
        out.push(n);
      }
    }
    return out;
  }
  if (Array.isArray(tree.children)) {
    tree.children = sanitizeNodes(tree.children);
  }
}
