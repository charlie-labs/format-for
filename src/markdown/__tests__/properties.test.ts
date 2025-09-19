import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { formatFor } from '../../index.js';

// Helper: strings without backticks to avoid changing Markdown fences
const noBacktick = fc
  .stringOf(fc.char().filter((c) => c !== '`' && c !== '\\' && c !== '\r'))
  .filter((s) => s.length > 0);

describe('property: never modify inlineCode/code contents', () => {
  it('inline code preserved across targets', async () => {
    await fc.assert(
      fc.asyncProperty(noBacktick, async (code) => {
        const md = `Before \`${code}\` After`;
        const [gh, sl, li] = await Promise.all([
          formatFor(md, 'github'),
          formatFor(md, 'slack'),
          formatFor(md, 'linear'),
        ]);
        expect(gh).toContain('`' + code + '`');
        expect(sl).toContain('`' + code + '`');
        expect(li).toContain('`' + code + '`');
      }),
      { numRuns: 50 }
    );
  });

  it('fenced code preserved across targets', async () => {
    await fc.assert(
      fc.asyncProperty(noBacktick, async (code) => {
        const md = '```\n' + code + '\n```';
        const [gh, sl, li] = await Promise.all([
          formatFor(md, 'github'),
          formatFor(md, 'slack'),
          formatFor(md, 'linear'),
        ]);
        expect(gh).toContain(code);
        expect(sl).toContain(code);
        expect(li).toContain(code);
      }),
      { numRuns: 30 }
    );
  });
});

describe('property: Slack never emits >>> unless at end (we never emit it)', () => {
  it('does not emit >>> in the middle of output', async () => {
    await fc.assert(
      fc.asyncProperty(fc.unicodeString(), async (s) => {
        const out = await formatFor(s, 'slack');
        const idx = out.indexOf('>>>');
        if (idx >= 0) {
          // If it appears, it must be at the very end
          expect(out.trimEnd().endsWith('>>>')).toBe(true);
        }
      }),
      { numRuns: 50 }
    );
  });
});
