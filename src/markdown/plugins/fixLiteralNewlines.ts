import { type Parent, type PhrasingContent, type Root, type Text } from 'mdast';
import { type Plugin } from 'unified';
import { visitParents } from 'unist-util-visit-parents';

/**
 * Convert the literal two-character sequence "\n" in text into mdast hard line
 * breaks. This preserves the author's intent across targets:
 *  - GitHub/Linear: remark-stringify renders `break` as two spaces + newline
 *  - Slack: our renderer emits a real "\n" for `break`
 *
 * Notes:
 *  - We DO NOT touch code/inlineCode nodes (they have `value`; no Text children).
 *  - Inside link labels, literal "\n" is replaced with a single space to avoid
 *    breaking link syntax or producing odd rendering artifacts.
 */
export const remarkFixLiteralNewlines: Plugin<[], Root> = () => {
  return (root: Root) => {
    visitParents(root, 'text', (node, ancestors) => {
      const v = String(node.value ?? '');
      if (!v.includes('\\n')) return;

      const parent = ancestors[ancestors.length - 1] as Parent | undefined;
      if (!parent || !Array.isArray(parent.children)) return;
      const children = parent.children as PhrasingContent[];
      const idx = (children as unknown[]).indexOf(node as unknown);
      if (idx < 0) return;

      const inLink = ancestors.some(
        (a) => a.type === 'link' || a.type === 'linkReference'
      );
      if (inLink) {
        (children as unknown[]).splice(idx, 1, {
          type: 'text',
          value: v.replace(/\\n/g, ' '),
        } as unknown);
        return;
      }

      const parts = v.split(/\\n/g);
      const out: PhrasingContent[] = [];
      for (let i = 0; i < parts.length; i++) {
        const piece = parts[i] ?? '';
        if (piece) out.push({ type: 'text', value: piece });
        if (i < parts.length - 1) out.push({ type: 'break' });
      }
      (children as unknown[]).splice(idx, 1, ...(out as unknown[]));
    });
  };
};
