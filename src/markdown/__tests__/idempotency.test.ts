import { describe, expect, test } from 'vitest';

import { formatFor } from '../../index.js';

describe('round-trip idempotency (supported constructs only)', () => {
  test('slack', async () => {
    const input = [
      'A paragraph with _emphasis_ and *strong* and `code`.',
      '',
      '• Bullet 1',
      '• Bullet 2',
      '',
      '> A quoted line',
    ].join('\n');
    const once = await formatFor.slack(input);
    const twice = await formatFor.slack(once);
    expect(twice).toBe(once);
  });

  test('github', async () => {
    const input = [
      '# Title',
      '',
      'A paragraph with [link](https://example.com) and `code`.',
      '',
      '```\nconst x = 1;\n```',
    ].join('\n');
    const once = await formatFor.github(input);
    const twice = await formatFor.github(once);
    expect(twice).toBe(once);
  });

  test('linear', async () => {
    const input = [
      'Paragraph',
      '',
      '+++ Details',
      '',
      'Hidden',
      '',
      '+++',
    ].join('\n');
    const once = await formatFor.linear(input);
    const twice = await formatFor.linear(once);
    expect(twice).toBe(once);
  });
});
