/* eslint-disable no-console */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { formatFor } from '../src/index.js';
import {
  type AutoLinkRule,
  type FormatOptions,
} from '../src/markdown/types.js';

function readMaybe(path: string): string | null {
  try {
    return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    return null;
  }
}

function readOptions(dir: string): FormatOptions | undefined {
  const raw = readMaybe(join(dir, 'options.json'));
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    const out: FormatOptions = {};
    const maybeObj = (v: unknown): v is Record<string, unknown> =>
      typeof v === 'object' && v !== null;
    const hasKey = <K extends string>(
      obj: unknown,
      key: K
    ): obj is Record<K, unknown> => maybeObj(obj) && key in obj;

    if (hasKey(parsed, 'autolinks') && hasKey(parsed.autolinks, 'linear')) {
      const linearVal = parsed.autolinks.linear;
      if (Array.isArray(linearVal)) {
        const rules: AutoLinkRule[] = linearVal
          .map((r: unknown) => {
            if (!maybeObj(r)) return null;
            const pattern = r['pattern'];
            const urlTemplate = r['urlTemplate'];
            if (
              typeof pattern !== 'string' ||
              typeof urlTemplate !== 'string'
            ) {
              return null;
            }
            const flags = typeof r['flags'] === 'string' ? r['flags'] : 'g';
            const labelTemplate =
              typeof r['labelTemplate'] === 'string'
                ? r['labelTemplate']
                : undefined;
            return {
              pattern: new RegExp(pattern, flags),
              urlTemplate,
              labelTemplate,
            } satisfies AutoLinkRule;
          })
          .filter(Boolean) as AutoLinkRule[];
        out.autolinks = { linear: rules };
      }
    }
    return out;
  } catch {
    return undefined;
  }
}

async function main() {
  const fixturesDir = resolve('src/markdown/__tests__/__fixtures__');
  const fixtures = readdirSync(fixturesDir)
    .map((n) => ({ name: n, path: join(fixturesDir, n) }))
    .filter((e) => statSync(e.path).isDirectory());

  for (const fx of fixtures) {
    const inputPath = join(fx.path, 'input.md');
    const input = readFileSync(inputPath, 'utf8');
    const opts = readOptions(fx.path);
    const gh = await formatFor(input, 'github', opts);
    // Capture only Slack warnings to warnings.txt
    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (msg?: unknown) => {
      warnings.push(String(msg ?? ''));
    };
    let sl = '';
    try {
      sl = await formatFor(input, 'slack', opts);
    } finally {
      console.warn = origWarn;
    }
    const ln = await formatFor(input, 'linear', opts);
    writeFileSync(join(fx.path, 'out.github.md'), gh);
    writeFileSync(join(fx.path, 'out.slack.txt'), sl);
    writeFileSync(join(fx.path, 'out.linear.md'), ln);
    if (warnings.length) {
      writeFileSync(join(fx.path, 'warnings.txt'), warnings.join('\n') + '\n');
    }
    // Reset warnings per fixture
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
