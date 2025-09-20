import { type Element, type Root } from 'hast';
import { toHtml } from 'hast-util-to-html';
import { toText } from 'hast-util-to-text';
import rehypeParse from 'rehype-parse';
import rehypeSanitize, {
  defaultSchema,
  type Options as Schema,
} from 'rehype-sanitize';
import { unified } from 'unified';
import { type Parent as UnistParent } from 'unist';
import { SKIP, visit } from 'unist-util-visit';

// Hoisted processors to avoid per-call allocation in hot paths
const parseHtml = unified().use(rehypeParse, { fragment: true });
const sanitizeDefault = unified().use(rehypeSanitize);

// Cache rehype-sanitize transformers per normalized allowlist to avoid
// per-call allocations in hot paths.
type RootTransformer = (tree: Root) => Root;
const linearSanitizerCache = new Map<string, RootTransformer>();

/**
 * Convert an arbitrary HTML fragment into plain text suitable for Slack.
 * - Drops dangerous nodes (script/style) and attributes via sanitize.
 * - Decodes entities (handled by the HTML parser).
 * - Converts <br> to newlines using whitespace: 'pre'.
 */
export function htmlFragmentToText(html: string): string {
  const root = parseHtml.parse(String(html ?? ''));
  // Remove dangerous nodes (script/style) entirely before text extraction.
  stripDangerous(root);
  // Default schema is conservative: drops unknown tags, keeps text.
  const clean = sanitizeDefault.runSync(root);
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
  const raw = parseHtml.parse(String(html ?? ''));
  // Transform the HAST tree in-place:
  // - Drop <script>/<style> and their contents
  // - Sanitize with a strict allowlist (strip disallowed tags; no attributes)
  stripDangerous(raw);
  const normalized = (allow ?? [])
    .map((t) => t.toLowerCase())
    .sort()
    .join(',');
  let transform = linearSanitizerCache.get(normalized);
  if (!transform) {
    const schema = linearSchema(allow ?? []);
    transform = rehypeSanitize(schema);
    linearSanitizerCache.set(normalized, transform);
  }
  const clean = transform(raw);

  const asHtml = toHtml(clean, { allowParseErrors: true });
  const trimmed = asHtml.trim();
  if (trimmed === '') return { kind: 'empty', value: '' };
  // If any markup-like form remains (tags or comments), return HTML; otherwise text.
  const looksLikeMarkup = /<[^>]+>/.test(trimmed);
  if (looksLikeMarkup) return { kind: 'html', value: trimmed };
  return { kind: 'text', value: toText(clean, { whitespace: 'pre' }) };
}

// Remove script/style elements entirely (including their children)
function stripDangerous(tree: Root): void {
  visit(
    tree,
    'element',
    (
      node: Element,
      index: number | undefined,
      parent: UnistParent | undefined
    ) => {
      if (parent && typeof index === 'number') {
        const name = String(node.tagName || '').toLowerCase();
        if (name === 'script' || name === 'style') {
          parent.children.splice(index, 1);
          return [SKIP, index];
        }
      }
      return undefined;
    }
  );
}

// Construct a strict schema for Linear: only specific tags, no attributes, preserve comments,
// and strip (unwrap) disallowed tags while keeping their children.
function linearSchema(allow: string[]): Schema {
  const allowed = new Set([
    'br',
    'details',
    'summary',
    'u',
    'sub',
    'sup',
    ...allow.map((t) => t.toLowerCase()),
  ] as const);
  return {
    ...defaultSchema,
    tagNames: Array.from(allowed),
    attributes: {},
    allowComments: true,
    strip: ['script', 'style'],
  } satisfies Schema;
}
