import { type ListItem, type Root } from 'mdast';
import { visit } from 'unist-util-visit';

/**
 * Rewrite lines for empty task list items (checked with no inline content)
 * from '-' or '1.' to '- [x]'/'- [ ]' (preserving blockquote prefixes and
 * indentation), while skipping fenced code blocks.
 */
export function fixEmptyTaskItems(ast: Root, markdown: string): string {
  const empties: boolean[] = [];
  visit(ast, 'listItem', (n: ListItem) => {
    // Consider an item "empty" when it has no non-list children. This
    // includes cases like `- [x]\n  - child` where the marker line itself has
    // no inline content but nested lists follow on subsequent lines.
    if (typeof n.checked !== 'boolean') return;
    const hasInlineContent = Array.isArray(n.children)
      ? n.children.some((c) => c.type !== 'list')
      : false;
    if (!hasInlineContent) empties.push(n.checked);
  });
  if (empties.length === 0) return markdown;

  const lines = markdown.split('\n');
  let i = 0;
  let inFence = false;
  let fenceChar: '`' | '~' | null = null;
  let fenceLen = 0;

  for (let idx = 0; idx < lines.length && i < empties.length; idx++) {
    const line = lines[idx];
    // Track fenced code blocks (``` or ~~~), honoring blockquotes and matching
    // fence characters so we don't rewrite inside fenced regions (quoted or not).
    const fence = /^(\s*(?:>\s*)*)(```+|~~~+)/.exec(String(line));
    if (fence) {
      const token = String(fence[2] ?? '');
      const first = token.charAt(0);
      const ch: '`' | '~' = first === '~' ? '~' : '`';
      const len = token.length;
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
        fenceLen = len;
      } else if (fenceChar === ch && len >= fenceLen) {
        inFence = false;
        fenceChar = null;
        fenceLen = 0;
      }
      continue;
    }
    if (inFence) continue;

    // Match a bare list marker line (unordered '-', '*', '+', or ordered '1.')
    // with optional blockquote prefixes and indentation, and no inline content.
    // Capture the exact token so we can preserve ordered vs unordered markers.
    const m = /^(\s*(?:>\s*)*)((?:[-*+])|\d+\.)\s*$/.exec(String(line));
    if (!m) continue;

    const prefix = String(m[1] ?? '');
    const token = String(m[2] ?? '-'); // '-' or '*' or '+' or '1.' etc.
    const marker = empties[i] ? '[x]' : '[ ]';
    lines[idx] = `${prefix}${token} ${marker}`;
    i++;
  }

  return lines.join('\n');
}
