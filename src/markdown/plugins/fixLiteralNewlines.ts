import { type Parent, type PhrasingContent, type Root, type Text } from 'mdast';
import { type Plugin } from 'unified';
import { visit } from 'unist-util-visit';

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
    visit(root, 'text', (node: Text, index, parent: Parent | undefined) => {
      if (!parent || typeof index !== 'number') return;
      const v = String(node.value ?? '');
      if (!v.includes('\\n')) return;

      // Slack/GFM link labels shouldn't contain hard breaks. Collapse to space.
      if (parent.type === 'link') {
        parent.children.splice(index, 1, {
          type: 'text',
          value: v.replace(/\\n/g, ' '),
        });
        return;
      }

      const parts = v.split(/\\n/g);
      const out: PhrasingContent[] = [];
      for (let i = 0; i < parts.length; i++) {
        const piece = parts[i] ?? '';
        if (piece) out.push({ type: 'text', value: piece });
        if (i < parts.length - 1) out.push({ type: 'break' });
      }
      parent.children.splice(index, 1, ...out);
    });
  };
};

export default remarkFixLiteralNewlines;
