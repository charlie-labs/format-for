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
    if (
      typeof n.checked === 'boolean' &&
      (!n.children || n.children.length === 0)
    ) {
      empties.push(n.checked);
    }
  });
  if (empties.length === 0) return markdown;

  const lines = markdown.split('\n');
  let i = 0;
  let inFence = false as boolean;
  let fenceChar: '`' | '~' | null = null;

  for (let idx = 0; idx < lines.length && i < empties.length; idx++) {
    const line = lines[idx];
    // Track fenced code blocks (``` or ~~~), honoring matching fence characters
    const fence = /^(\s*)(```+|~~~+)/.exec(String(line));
    if (fence) {
      const token = String(fence[2] ?? '');
      const ch = (token[0] as '`' | '~') ?? '`';
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
      } else if (fenceChar === ch) {
        inFence = false;
        fenceChar = null;
      }
      continue;
    }
    if (inFence) continue;

    // Match a bare list marker (unordered '-' or ordered '1.') with optional
    // blockquote prefixes and indentation, and no inline content.
    const m = /^(\s*(?:>\s*)*)(?:-\s*|\d+\.\s*)$/.exec(String(line));
    if (!m) continue;

    const prefix = String(m[1] ?? '');
    const marker = empties[i] ? '[x]' : '[ ]';
    lines[idx] = `${prefix}- ${marker}`;
    i++;
  }

  return lines.join('\n');
}
