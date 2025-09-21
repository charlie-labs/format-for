import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

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

      afterEach(() => {
        // Ensure spies are always cleaned up to avoid hanging open handles in CI
        try {
          warnSpy?.mockRestore?.();
        } finally {
          vi.restoreAllMocks();
        }
      });

      test('github', async () => {
        const input = readFileSync(join(fx.path, 'input.md'), 'utf8');
        const expected = readMaybe(join(fx.path, 'out.github.md'));
        if (expected != null) {
          const out = await formatFor.github(input);
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
          const out = await formatFor.slack(input);
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
        const expectedWarnings =
          readMaybe(join(fx.path, 'warnings.linear.txt'))
            ?.split('\n')
            .filter(Boolean) ?? [];
        if (expected != null) {
          const out = await formatFor.linear(input);
          expect(out).toBe(expected);
        }
        if (expectedWarnings.length > 0) {
          const calls = warnSpy.mock.calls.map((args: unknown[]) =>
            String(args[0] as unknown)
          );
          expect(calls).toEqual(expectedWarnings);
        }
      });

      // Round-trip is asserted separately on curated inputs per target.
    });
  }
});
