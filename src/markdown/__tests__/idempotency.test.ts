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
    const once = await formatFor(input, 'slack');
    const twice = await formatFor(once, 'slack');
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
    const once = await formatFor(input, 'github');
    const twice = await formatFor(once, 'github');
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
    const once = await formatFor(input, 'linear');
    const twice = await formatFor(once, 'linear');
    expect(twice).toBe(once);
  });
});
