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

    const outSlack = await formatFor(input, 'slack', {
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
    expect(outSlack).toContain('&lt;!here&gt;');
    expect(outSlack).toContain('<https://ex.com|Ex>');

    const outLinear = await formatFor(input, 'linear', {
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
    const out = await formatFor(input, 'github', {
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
});
