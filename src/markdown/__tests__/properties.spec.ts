import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { formatFor } from '../../index.js';

// Helper: generate strings without backticks fence markers to avoid confusing the simple pre-parser
const safeStringArb = fc
  .string({ minLength: 1 })
  .filter((s) => !s.includes('```') && !s.includes('+++') && !s.includes('`'));

describe('property tests', () => {
  it('never modifies inlineCode contents (all targets)', async () => {
    await fc.assert(
      fc.asyncProperty(safeStringArb, async (s) => {
        const input = `before \`${s}\` after`;
        const gh = await formatFor(input, 'github');
        const sl = await formatFor(input, 'slack');
        const ln = await formatFor(input, 'linear');
        // Inline code must be present verbatim in outputs
        expect(gh).toContain('`' + s + '`');
        expect(sl).toContain('`' + s + '`');
        expect(ln).toContain('`' + s + '`');
      }),
      { numRuns: 50 }
    );
  });

  it('never modifies fenced code contents (all targets)', async () => {
    await fc.assert(
      fc.asyncProperty(safeStringArb, async (s) => {
        const content = s;
        const wrapped = '```\n' + content + '\n```';
        const gh = await formatFor(wrapped, 'github');
        const sl = await formatFor(wrapped, 'slack');
        const ln = await formatFor(wrapped, 'linear');
        expect(gh).toContain(content);
        expect(sl).toContain(content);
        expect(ln).toContain(content);
      }),
      { numRuns: 30 }
    );
  });

  it('never emits >>> in Slack output except possibly at end-of-message', async () => {
    await fc.assert(
      fc.asyncProperty(safeStringArb, async (s) => {
        const out = await formatFor(s, 'slack');
        const idx = out.indexOf('>>>');
        if (idx === -1) return;
        // If present, only allowed if it is at the end (no non-space after it)
        const after = out.slice(idx + 3);
        expect(/^[\s\n]*$/.test(after)).toBe(true);
      }),
      { numRuns: 30 }
    );
  });
});
