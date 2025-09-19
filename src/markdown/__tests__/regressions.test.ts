import { describe, expect, it } from 'vitest';

import { formatFor } from '../../index.js';

describe('regressions from PR review: illustrate current functional gaps', () => {
  it.fails(
    'Slack: special mentions should remain unescaped (<!here>, <!channel>, <!everyone>)',
    async () => {
      const out = await formatFor(
        'ping @here and @channel and @everyone',
        'slack'
      );
      // Correct behavior: emit Slack mention tokens, not HTML-escaped entities.
      expect(out).toContain('<!here>');
      expect(out).toContain('<!channel>');
      expect(out).toContain('<!everyone>');
      expect(out).not.toContain('&lt;!here&gt;');
    }
  );

  it.fails(
    'Slack: preserve Slack angle forms in block HTML even when surrounded by whitespace',
    async () => {
      const md = '\n<@U123456>\n';
      const out = await formatFor(md, 'slack');
      // Correct behavior: keep the raw Slack mention intact.
      expect(out.trim()).toBe('<@U123456>');
    }
  );

  // Note: attempted reproduction for prefixed blank-quote lines did not reproduce
  // with this parser/printer shape; leaving coverage to existing fixtures which
  // already assert an unquoted blank line between adjacent blockquotes.

  it.fails(
    'Linear: do not convert <details>…</details> to +++ blocks inside fenced code',
    async () => {
      const md = '```\n<details><summary>Title</summary>Body</details>\n```';
      const out = await formatFor(md, 'linear');
      // Correct behavior: code content must remain untouched (no +++ inside the fence).
      expect(out).toContain('<details><summary>Title</summary>Body</details>');
      expect(out).not.toContain('+++');
    }
  );

  it.fails(
    'Linear: autolinks and @user mapping must not rewrite content inside fenced code',
    async () => {
      const md = '```\nsee ABC-123 and @alice\n```';
      const out = await formatFor(md, 'linear', {
        autolinks: {
          linear: [
            {
              pattern: /\b([A-Z]{3}-\d{3})\b/g,
              urlTemplate: 'https://t.example/$1',
              labelTemplate: 'JIRA $1',
            },
          ],
        },
        maps: {
          linear: {
            users: { alice: { url: 'https://x/alice', label: 'Alice A.' } },
          },
        },
      });
      // Correct behavior: keep literals inside the code fence.
      expect(out).toContain('ABC-123');
      expect(out).toContain('@alice');
      expect(out).not.toContain('https://t.example/ABC-123');
      expect(out).not.toContain('[Alice A.](https://x/alice)');
    }
  );

  it.fails(
    'Linear: HTML allowlist should be case-insensitive (keep <BR/>)',
    async () => {
      const md = 'before <BR/> after';
      const out = await formatFor(md, 'linear');
      // Correct behavior: since `br` is allowed, <BR/> should be preserved too.
      expect(out).toContain('<BR/>');
    }
  );

  it.fails(
    'Linear: autolinks and @user mapping must not rewrite inline code',
    async () => {
      const md = 'Use `ABC-123` and `@alice` in code';
      const out = await formatFor(md, 'linear', {
        autolinks: {
          linear: [
            {
              pattern: /\b([A-Z]{3}-\d{3})\b/g,
              urlTemplate: 'https://t.example/$1',
              labelTemplate: 'JIRA $1',
            },
          ],
        },
        maps: {
          linear: {
            users: { alice: { url: 'https://x/alice', label: 'Alice A.' } },
          },
        },
      });
      // Correct behavior: keep inline code untouched.
      expect(out).toContain('`ABC-123`');
      expect(out).toContain('`@alice`');
      expect(out).not.toContain('https://t.example/ABC-123');
      expect(out).not.toContain('[Alice A.](https://x/alice)');
    }
  );
});
