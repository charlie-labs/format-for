import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { formatFor } from '../../index.js';

describe('property tests', () => {
  test('never modify inlineCode/code contents', async () => {
    const safeStr = fc
      .string()
      .filter(
        (s) =>
          !s.includes('`') &&
          !s.includes('\r') &&
          !/^\s|\s$/.test(s) &&
          !s.includes('\n')
      );
    const safeFence = fc
      .string()
      .filter((s) => !s.includes('```') && !s.includes('\r'));
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(fc.string(), safeStr, safeFence),
        async ([a, b, c]) => {
          const inline = `${a}\n\nHere is \`${b}\` inside text.\n\n\`\`\`\n${c}\n\`\`\`\n`;
          for (const target of ['github', 'slack', 'linear'] as const) {
            const out = await formatFor(inline, target);
            // Inline code preserved
            expect(out).toContain(b);
            // Fenced code preserved line-for-line
            expect(out).toContain(c);
          }
        }
      ),
      {
        verbose: true,
        // Keep CI stable: cap the number of runs and interrupt long shrinks
        numRuns: 50,
        interruptAfterTimeLimit: 15000,
      }
    );
  });

  test('Slack: never emit >>> unless block is at end (we never emit it)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (s) => {
        const out = await formatFor(`> ${s}\n\npara`, 'slack');
        const idx = out.indexOf('>>>');
        expect(idx).toBe(-1);
      }),
      { verbose: true, numRuns: 50, interruptAfterTimeLimit: 10000 }
    );
  });
});
