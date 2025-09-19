import { describe, expect, test } from 'vitest';

import { formatFor } from '../../index.js';

describe('canonicalizer: preserves trailing text after inline matches', () => {
  test('user mention with trailing text', async () => {
    const input = 'Hello <@U123> world';
    const out = await formatFor(input, 'github');
    expect(out).toContain('Hello @U123 world');
  });

  test('channel mention with and without trailing text', async () => {
    const withTail = await formatFor('Go <#C77|dev> now', 'github');
    expect(withTail).toContain('Go #dev now');

    const noTail = await formatFor('Go <#C77|dev>', 'github');
    expect(noTail).toContain('Go #dev');
  });

  test('Slack link with and without trailing text', async () => {
    const withTail = await formatFor(
      'Check <https://ex.com|Ex> please',
      'github'
    );
    expect(withTail).toContain('Check <https://ex.com|Ex> please');

    const noTail = await formatFor('Check <https://ex.com|Ex>', 'github');
    expect(noTail).toContain('Check <https://ex.com|Ex>');
  });
});
