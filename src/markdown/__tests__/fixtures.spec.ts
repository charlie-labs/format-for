import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
/* eslint-disable no-loop-func */

import { formatFor } from '../../index.js';

const FIXTURES_DIR = join(__dirname, '__fixtures__');

function read(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

function listFixtures(): string[] {
  return readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

describe('fixtures: exact outputs and warnings', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  for (const name of listFixtures()) {
    it(`${name}: renders github/slack/linear exactly and emits ordered warnings`, async () => {
      const dir = join(FIXTURES_DIR, name);
      const input = read(join(dir, 'input.md'));

      const outGithub = await formatFor(input, 'github');
      const outSlack = await formatFor(input, 'slack');
      const outLinear = await formatFor(input, 'linear');

      const expectedGithub = read(join(dir, 'out.github.md'));
      const expectedSlack = read(join(dir, 'out.slack.txt'));
      const expectedLinear = read(join(dir, 'out.linear.md'));
      const expectedWarnings = read(join(dir, 'warnings.txt'))
        .split('\n')
        .filter(Boolean);

      expect(outGithub).toBe(expectedGithub);
      expect(outSlack).toBe(expectedSlack);
      expect(outLinear).toBe(expectedLinear);

      const actualWarnings = warnSpy.mock.calls.map((c) => String(c[0] ?? ''));
      expect(actualWarnings).toEqual(expectedWarnings);

      warnSpy.mockRestore();
    });
  }
});

// Round-trip tests are covered in a separate suite for supported constructs only.
