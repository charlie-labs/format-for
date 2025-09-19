import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { formatFor } from '../../index.js';

const FIXTURES_DIR = resolve(__dirname, '__fixtures__');

function readMaybe(path: string): string | null {
  try {
    return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    return null;
  }
}

describe('fixtures: exact outputs per target + warnings', () => {
  const fixtures = readdirSync(FIXTURES_DIR)
    .map((n) => ({ name: n, path: join(FIXTURES_DIR, n) }))
    .filter((e) => statSync(e.path).isDirectory());

  for (const fx of fixtures) {
    describe(fx.name, () => {
      // Casting to any is acceptable in tests to simplify MockInstance typing
      let warnSpy: any;
      beforeEach(() => {
        warnSpy = vi
          .spyOn(console, 'warn')
          .mockImplementation((_msg?: unknown, ..._rest: unknown[]) => {
            // swallow warnings in tests
          });
      });

      test('github', async () => {
        const input = readFileSync(join(fx.path, 'input.md'), 'utf8');
        const expected = readMaybe(join(fx.path, 'out.github.md'));
        if (expected != null) {
          const out = await formatFor(input, 'github');
          expect(out).toBe(expected);
        }
      });

      test('slack', async () => {
        const input = readFileSync(join(fx.path, 'input.md'), 'utf8');
        const expected = readMaybe(join(fx.path, 'out.slack.txt'));
        const expectedWarnings =
          readMaybe(join(fx.path, 'warnings.txt'))
            ?.split('\n')
            .filter(Boolean) ?? [];
        if (expected != null) {
          const out = await formatFor(input, 'slack');
          expect(out).toBe(expected);
        }
        if (expectedWarnings.length > 0) {
          const calls = warnSpy.mock.calls.map((args: unknown[]) =>
            String(args[0] as unknown)
          );
          expect(calls).toEqual(expectedWarnings);
        }
      });

      test('linear', async () => {
        const input = readFileSync(join(fx.path, 'input.md'), 'utf8');
        const expected = readMaybe(join(fx.path, 'out.linear.md'));
        if (expected != null) {
          const out = await formatFor(input, 'linear');
          expect(out).toBe(expected);
        }
      });

      // Round-trip is asserted separately on curated inputs per target.
    });
  }
});
