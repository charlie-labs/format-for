import { type Break, type Root, type Text } from 'mdast';
import { type Plugin } from 'unified';
import { type Parent as UnistParent } from 'unist';
import { visitParents } from 'unist-util-visit-parents';

/**
 * Convert the literal two-character sequence "\n" in text into mdast hard line
 * breaks. This preserves the author's intent across targets:
 *  - GitHub/Linear: we render `break` as two spaces + newline
 *  - Slack: our renderer emits a real "\n" for `break`
 *
 * Notes:
 *  - We DO NOT touch code/inlineCode nodes (they have `value`; no Text children).
 *  - Inside link labels, literal "\n" is replaced with a single space to avoid
 *    breaking link syntax or producing odd rendering artifacts.
 */
export const remarkFixLiteralNewlines: Plugin<[], Root> = () => {
  return (root: Root) => {
    visitParents(root, 'text', (node: Text, ancestors: UnistParent[]) => {
      const v = node.value ?? '';
      if (!v.includes('\\n')) return;

      const parent = ancestors[ancestors.length - 1];
      if (!parent) return;
      const children = parent.children;
      const idx = children.indexOf(node);
      if (idx < 0) return;

      const inLink = ancestors.some(
        (a) => a.type === 'link' || a.type === 'linkReference'
      );
      if (inLink) {
        // Collapse any literal "\n" (and adjacent whitespace) to a single space
        // so link labels never contain multiple spaces.
        const replaced: Text = {
          type: 'text',
          value: v.replace(/\s*\\n\s*/g, ' '),
        };
        children.splice(idx, 1, replaced);
        return;
      }

      const parts = v.split(/\\n/g);
      const out: (Text | Break)[] = [];
      for (let i = 0; i < parts.length; i++) {
        const piece = parts[i] ?? '';
        if (piece) {
          const t: Text = { type: 'text', value: piece };
          out.push(t);
        }
        if (i < parts.length - 1) {
          const br: Break = { type: 'break' };
          out.push(br);
        }
      }
      children.splice(idx, 1, ...out);
    });
  };
};
