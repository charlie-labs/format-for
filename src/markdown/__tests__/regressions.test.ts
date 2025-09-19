import { describe, expect, test, vi } from 'vitest';

import { formatFor } from '../../index.js';

/**
 * Regression tests that currently fail with the existing implementation.
 * Marked with `test.fails` to document the bug while keeping CI green.
 * Each case corresponds to a functional issue called out in PR review.
 */

describe('regressions (document current functional gaps)', () => {
  test.fails(
    'Canonicalizer: drops trailing unmatched text after a match (e.g., after <@U…>)',
    async () => {
      const input = 'Hello <@U123> world';
      const outGithub = await formatFor(input, 'github');
      // Expected: mention + trailing text retained
      expect(outGithub).toBe('Hello @U123 world\n');
    }
  );

  test.fails(
    'Autolinks: multiple rules cause duplication/loss; should link both without duplication',
    async () => {
      const input = 'Work on BOT-123 and OPS-45 today.';
      const outGithub = await formatFor(input, 'github', {
        autolinks: {
          linear: [
            {
              pattern: /BOT-(\d+)/g,
              urlTemplate: 'https://linear.app/issue/BOT-$1',
              labelTemplate: 'BOT-$1',
            },
            {
              pattern: /OPS-(\d+)/g,
              urlTemplate: 'https://linear.app/issue/OPS-$1',
              labelTemplate: 'OPS-$1',
            },
          ],
        },
      });
      // Expected: both tokens linkified exactly once, order preserved, no duplicated text
      expect(outGithub).toBe(
        [
          '[BOT-123](https://linear.app/issue/BOT-123) and ',
          '[OPS-45](https://linear.app/issue/OPS-45) today.\n',
        ].join('')
      );
    }
  );

  test.fails(
    'Linear HTML allowlist: mixed allowed + disallowed tags should be stripped (not kept)',
    async () => {
      const input = 'before\n\n<u>keep</u><script>nope()</script>\n\nafter';
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
        return; // no-op in tests
      });
      const out = await formatFor(input, 'linear', {
        linearHtmlAllow: ['details', 'summary', 'u', 'sub', 'sup', 'br'],
      });
      warn.mockRestore();
      // Expected: the mixed HTML block is stripped entirely (contains disallowed <script>)
      expect(out).toBe('before\n\nafter\n');
    }
  );
});
