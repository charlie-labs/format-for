import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { formatFor } from '../../index.js';

const FIXTURES_DIR = resolve(__dirname, '__fixtures__');

function read(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

describe('fixtures: exact output per target and warnings order', () => {
  const dirs = readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const name of dirs) {
    const dir = join(FIXTURES_DIR, name);
    const input = read(join(dir, 'input.md'));

    it(`${name}: matches outputs and warnings`, async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* noop */
      });
      const warnings: string[] = [];
      warn.mockImplementation((msg: string) => {
        warnings.push(String(msg));
      });

      const outGithub = await formatFor(input, 'github');
      const outSlack = await formatFor(input, 'slack');
      const outLinear = await formatFor(input, 'linear');

      warn.mockRestore();

      expect(outGithub.replace(/\r\n/g, '\n')).toBe(
        read(join(dir, 'out.github.md'))
      );
      expect(outSlack.replace(/\r\n/g, '\n')).toBe(
        read(join(dir, 'out.slack.txt'))
      );
      expect(outLinear.replace(/\r\n/g, '\n')).toBe(
        read(join(dir, 'out.linear.md'))
      );

      const expectedWarningsPath = join(dir, 'warnings.txt');
      const expectedWarnings = read(expectedWarningsPath)
        .split(/\n/)
        .filter((l) => l.length > 0);
      expect(warnings).toEqual(expectedWarnings);
    });
  }
});
