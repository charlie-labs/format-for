import { describe, expect, test } from 'vitest';

import { formatFor } from '../../index.js';

describe('canonicalizer: preserves trailing text after inline matches', () => {
  test('user mention with trailing text', async () => {
    const input = 'Hello <@U123> world';
    const out = await formatFor.github(input);
    expect(out).toContain('Hello @U123 world');
  });

  test('channel mention with and without trailing text', async () => {
    const withTail = await formatFor.github('Go <#C77|dev> now');
    expect(withTail).toContain('Go #dev now');

    const noTail = await formatFor.github('Go <#C77|dev>');
    expect(noTail).toContain('Go #dev');
  });

  test('Slack link with and without trailing text', async () => {
    const withTail = await formatFor.github('Check <https://ex.com|Ex> please');
    expect(withTail).toContain('Check [Ex](https://ex.com) please');

    const noTail = await formatFor.github('Check <https://ex.com|Ex>');
    expect(noTail).toContain('Check [Ex](https://ex.com)');
  });
});
