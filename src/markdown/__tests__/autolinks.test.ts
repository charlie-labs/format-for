import { describe, expect, test } from 'vitest';

import { formatFor } from '../../index.js';

const rules = [
  {
    pattern: /BOT-(\d+)/g,
    urlTemplate: 'https://linear.app/acme/issue/BOT-$1',
    labelTemplate: '$0',
  },
  {
    pattern: /OPS-(\d+)/g,
    urlTemplate: 'https://linear.app/acme/issue/OPS-$1',
    labelTemplate: '$0',
  },
];

describe('autolinks: left-to-right scan across multiple rules', () => {
  test('links from multiple rules without duplication or loss', async () => {
    const input = 'Work on BOT-123 and OPS-45 today.';
    const out = await formatFor(input, 'github', {
      autolinks: { linear: rules },
    });
    expect(out).toContain(
      'Work on [BOT-123](https://linear.app/acme/issue/BOT-123) and [OPS-45](https://linear.app/acme/issue/OPS-45) today.'
    );
  });

  test('adjacent tokens and punctuation are preserved exactly once', async () => {
    const input = 'BOT-1,OPS-2;BOT-3';
    const out = await formatFor(input, 'github', {
      autolinks: { linear: rules },
    });
    expect(out).toContain(
      '[BOT-1](https://linear.app/acme/issue/BOT-1),[OPS-2](https://linear.app/acme/issue/OPS-2);[BOT-3](https://linear.app/acme/issue/BOT-3)'
    );
  });

  test('mixed content: Slack angle link stays literal; autolink still applies', async () => {
    const input = 'See <https://ex.com|Ex> then BOT-123!';
    const out = await formatFor(input, 'github', {
      autolinks: { linear: rules },
    });
    expect(out).toContain('<https://ex.com|Ex>');
    expect(out).toContain(
      'then [BOT-123](https://linear.app/acme/issue/BOT-123)!'
    );
  });

  test('never autolink inside an existing link label', async () => {
    const input = '[BOT-123](https://example.com) and BOT-456';
    const out = await formatFor(input, 'github', {
      autolinks: { linear: rules },
    });
    // Left label remains unchanged; only BOT-456 is linked
    expect(out).toContain(
      '](https://example.com) and [BOT-456](https://linear.app/acme/issue/BOT-456)'
    );
  });
});
