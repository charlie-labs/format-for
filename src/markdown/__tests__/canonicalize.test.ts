import { describe, expect, test } from 'vitest';

import { formatFor } from '../../index.js';

describe('canonicalizer normalization paths (exercise branches)', () => {
  test('Slack angle forms, ~strike~, Linear @user mapping, details', async () => {
    const input = [
      'pre ~del~ <@U42> <#C77|dev> <!here> <https://ex.com|Ex> <https://b.co>',
      '',
      '+++ Title',
      '',
      'body',
      '',
      '@riley mentions',
    ].join('\n');

    const outSlack = await formatFor.slack(input, {
      maps: {
        linear: {
          users: {
            riley: { url: 'https://linear.app/u/riley', label: 'Riley' },
          },
        },
      },
    });
    expect(outSlack).toContain('<@U42>');
    expect(outSlack).toContain('<#C77|dev>');
    expect(outSlack).toContain('<!here>');
    expect(outSlack).toContain('<https://ex.com|Ex>');

    const outLinear = await formatFor.linear(input, {
      maps: {
        linear: {
          users: {
            riley: { url: 'https://linear.app/u/riley', label: 'Riley' },
          },
        },
      },
    });
    expect(outLinear).toContain('+++ Title');
    expect(outLinear).toContain('[Riley](https://linear.app/u/riley)');
  });

  test('autolink rules are applied', async () => {
    const input = 'Reference BOT-123 should link.';
    const out = await formatFor.github(input, {
      autolinks: {
        linear: [
          {
            pattern: /BOT-(\d+)/g,
            urlTemplate: 'https://linear.app/issue/BOT-$1',
            labelTemplate: 'BOT-$1',
          },
        ],
      },
    });
    expect(out).toContain('[BOT-123](https://linear.app/issue/BOT-123)');
  });

  test('autolinks apply inside text fragments adjacent to a Markdown link and a Slack mention', async () => {
    const input = [
      'Start [Ex](https://ex.com) BOT-234 end.',
      '<@U42> then BOT-345 after mention.',
    ].join('\n');
    const out = await formatFor.github(input, {
      autolinks: {
        linear: [
          {
            pattern: /BOT-(\d+)/g,
            urlTemplate: 'https://linear.app/issue/BOT-$1',
            labelTemplate: 'BOT-$1',
          },
        ],
      },
    });
    expect(out).toContain('[BOT-234](https://linear.app/issue/BOT-234)');
    expect(out).toContain('[BOT-345](https://linear.app/issue/BOT-345)');
  });

  test('autolinks are not created inside code, but still apply to adjacent text', async () => {
    const input = 'Use `code BOT-456` then BOT-567';
    const out = await formatFor.github(input, {
      autolinks: {
        linear: [
          {
            pattern: /BOT-(\d+)/g,
            urlTemplate: 'https://linear.app/issue/BOT-$1',
            labelTemplate: 'BOT-$1',
          },
        ],
      },
    });
    expect(out).toContain('`code BOT-456`');
    expect(out).toContain('[BOT-567](https://linear.app/issue/BOT-567)');
  });
});
