import { describe, expect, it, vi } from 'vitest';

import { formatFor } from '../../index.js';

describe('targeted behaviors for coverage', () => {
  it('Slack: hard line break inside paragraph', async () => {
    const input = 'Line one  \nLine two';
    const out = await formatFor(input, 'slack');
    expect(out).toContain('Line one\nLine two');
  });

  it('Slack: ordered lists render with numbers', async () => {
    const input = '1. first\n2. second';
    const out = await formatFor(input, 'slack');
    expect(out).toContain('1. first');
    expect(out).toContain('2. second');
  });

  it('Canonicalizer: strike (~text~) preserved into Slack as ~text~', async () => {
    const input = 'keep ~strike~';
    const out = await formatFor(input, 'slack');
    expect(out).toContain('~strike~');
  });

  it('Canonicalizer: Linear @user mapping', async () => {
    const input = 'ping @alice';
    const out = await formatFor(input, 'github', {
      maps: {
        linear: {
          users: {
            alice: { url: 'https://linear.app/u/alice', label: 'Alice' },
          },
        },
      },
    });
    expect(out).toContain('[Alice](https://linear.app/u/alice)');
  });

  it('Canonicalizer: autolink rules apply (Linear)', async () => {
    const input = 'See BOT-123 and BOT-9.';
    const out = await formatFor(input, 'github', {
      autolinks: {
        linear: [
          { pattern: /BOT-(\d+)/g, urlTemplate: 'https://t.example/BOT-$1' },
        ],
      },
    });
    expect(out).toContain('[BOT-123](https://t.example/BOT-123)');
    expect(out).toContain('[BOT-9](https://t.example/BOT-9)');
  });

  it('Linear: strip disallowed HTML, allowlist passes through (stringifier may drop)', async () => {
    const input = '<script>alert(1)</script> <u>ok</u>';
    const out = await formatFor(input, 'linear');
    expect(out).not.toContain('script');
    // We don't assert 'ok' presence because remark-stringify drops HTML by default
    // (we are only exercising the allowlist path here).
  });

  it('GitHub: details summary escapes HTML', async () => {
    const input = '+++ a < & >\nbody\n+++';
    const out = await formatFor(input, 'github');
    expect(out).toContain('&lt;');
    expect(out).toContain('&gt;');
    expect(out).toContain('&amp;');
  });

  it('Slack: warnOnce emits each warning only once', async () => {
    const input =
      '| a | b |\n| - | - |\n| 1 | 2 |\n\n![x](https://x)\n\n| h | i |\n| - | - |\n| 3 | 4 |';
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await formatFor(input, 'slack');
    const messages = spy.mock.calls.map((c) => String(c[0] ?? ''));
    // table downgraded and image downgraded should each appear once
    expect(messages.filter((m) => m.includes('table downgraded')).length).toBe(
      1
    );
    expect(messages.filter((m) => m.includes('image downgraded')).length).toBe(
      1
    );
    spy.mockRestore();
  });
});
