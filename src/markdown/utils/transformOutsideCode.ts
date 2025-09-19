import { type Content, type Root } from 'mdast';
import { type Parent } from 'unist';
import { visit } from 'unist-util-visit';

export type TextTransformer = (
  value: string
) => Content[] | string | null | undefined;

/**
 * Visit text nodes outside of code/inlineCode and allow a transformer to
 * return replacement nodes or a string. If null/undefined is returned, the
 * node is left as-is.
 */
export function transformOutsideCode(root: Root, fn: TextTransformer): void {
  const codeParents = new Set<Content['type']>(['code', 'inlineCode']);

  visit(root, 'text', (node, index, parent) => {
    if (!parent) return; // continue
    if ('type' in parent && codeParents.has((parent as Content).type)) return; // do not transform inside code
    const out = fn(node.value);
    if (out == null) return;
    if (typeof out === 'string') {
      node.value = out;
      return;
    }
    if (typeof index !== 'number') return;
    const p = parent as Parent & { children: Content[] };
    p.children.splice(index, 1, ...out);
  });
}
