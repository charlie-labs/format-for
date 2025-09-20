import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

import { formatFor } from '../../index.js';

const FX_DIR = new URL('__fixtures-autolinks__/mixed/', import.meta.url);

describe('autolinks: mixed-content fixture (github exact output)', () => {
  test('github rendering matches fixture with autolink rules', async () => {
    const input = await readFile(new URL('input.md', FX_DIR), 'utf8');
    const expected = await readFile(new URL('out.github.md', FX_DIR), 'utf8');

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

    expect(out).toBe(expected);
  });
});
