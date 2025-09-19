import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { formatFor } from '../../index.js';
import { type AutoLinkRule, type FormatOptions } from '../types.js';

const FIXTURES_DIR = resolve(__dirname, '__fixtures__');

function readMaybe(path: string): string | null {
  try {
    return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    return null;
  }
}

function readOptions(dir: string): FormatOptions | undefined {
  const p = join(dir, 'options.json');
  const raw = readMaybe(p);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    // Support only autolinks for now; compile regex patterns from strings
    const out: FormatOptions = {};
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed as any).autolinks &&
      (parsed as any).autolinks.linear &&
      Array.isArray((parsed as any).autolinks.linear)
    ) {
      const rules: AutoLinkRule[] = ((parsed as any).autolinks.linear as any[])
        .map((r) => {
          const pattern = String(r.pattern ?? '');
          const flags = String(r.flags ?? 'g');
          const urlTemplate = String(r.urlTemplate ?? '');
          const labelTemplate = r.labelTemplate
            ? String(r.labelTemplate)
            : undefined;
          if (!pattern || !urlTemplate) return null;
          return {
            pattern: new RegExp(pattern, flags),
            urlTemplate,
            labelTemplate,
          } satisfies AutoLinkRule;
        })
        .filter(Boolean) as AutoLinkRule[];
      out.autolinks = { linear: rules };
    }
    return out;
  } catch {
    return undefined;
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
        const opts = readOptions(fx.path);
        if (expected != null) {
          const out = await formatFor(input, 'github', opts);
          expect(out).toBe(expected);
        }
      });

      test('slack', async () => {
        const input = readFileSync(join(fx.path, 'input.md'), 'utf8');
        const expected = readMaybe(join(fx.path, 'out.slack.txt'));
        const opts = readOptions(fx.path);
        const expectedWarnings =
          readMaybe(join(fx.path, 'warnings.txt'))
            ?.split('\n')
            .filter(Boolean) ?? [];
        if (expected != null) {
          const out = await formatFor(input, 'slack', opts);
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
        const opts = readOptions(fx.path);
        if (expected != null) {
          const out = await formatFor(input, 'linear', opts);
          expect(out).toBe(expected);
        }
      });

      // Round-trip is asserted separately on curated inputs per target.
    });
  }
});
