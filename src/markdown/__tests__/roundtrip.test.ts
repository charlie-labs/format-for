import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// path import moved above vitest to satisfy import ordering

import { formatFor } from '../../index.js';

const FIXTURES_DIR = resolve(__dirname, '__fixtures__');

function read(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

describe('round-trip idempotency on supported constructs', () => {
  it('GitHub: output is idempotent for all fixtures', async () => {
    const dirs = readdirSync(FIXTURES_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const name of dirs) {
      const input = read(join(FIXTURES_DIR, name, 'input.md'));
      const once = await formatFor(input, 'github');
      const twice = await formatFor(once, 'github');
      expect(twice).toBe(once);
    }
  });

  it('Linear: output is idempotent (after first pass normalizes details/HTML)', async () => {
    const dirs = readdirSync(FIXTURES_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const name of dirs) {
      const input = read(join(FIXTURES_DIR, name, 'input.md'));
      const once = await formatFor(input, 'linear');
      const twice = await formatFor(once, 'linear');
      expect(twice).toBe(once);
    }
  });

  it('Slack: simple non-heading constructs are idempotent', async () => {
    const md = '- a\n- b\n\nText paragraph';
    const once = await formatFor(md, 'slack');
    const twice = await formatFor(once, 'slack');
    expect(twice).toBe(once);
  });
});
