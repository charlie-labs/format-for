import { type Content, type Root } from 'mdast';

import { transformOutsideCode } from '../utils/transformOutsideCode.js';

/**
 * Normalize mixed Markdown forms into a canonical MDAST.
 * - Convert Slack-style ~strike~ into MDAST delete nodes (like GFM ~~strike~~)
 */
export function remarkCanonicalizeMixed() {
  return function transformer(tree: Root) {
    // Replace ~text~ with delete node(s) in text content (outside code)
    transformOutsideCode(tree, (value) => {
      // Quick check
      if (!value.includes('~')) return null;
      const out: Content[] = [];
      let i = 0;
      const re = /~([^\n~]+)~/g; // simple, non-greedy within line
      let m: RegExpExecArray | null;
      while ((m = re.exec(value))) {
        const full = m[0];
        const struck = m[1];
        if (struck == null) continue;
        const start = m.index;
        if (start > i) {
          out.push({ type: 'text', value: value.slice(i, start) });
        }
        out.push({
          type: 'delete',
          children: [{ type: 'text', value: struck }],
        });
        i = start + full.length;
      }
      if (out.length === 0) return null; // nothing replaced
      if (i < value.length) {
        out.push({ type: 'text', value: value.slice(i) });
      }
      return out;
    });
  };
}
