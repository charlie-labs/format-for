/* eslint-disable no-console */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { formatFor } from '../src/index.js';

async function main() {
  const fixturesDir = resolve('src/markdown/__tests__/__fixtures__');
  const fixtures = readdirSync(fixturesDir)
    .map((n) => ({ name: n, path: join(fixturesDir, n) }))
    .filter((e) => statSync(e.path).isDirectory());

  for (const fx of fixtures) {
    const inputPath = join(fx.path, 'input.md');
    const input = readFileSync(inputPath, 'utf8');
    const gh = await formatFor.github(input);
    // Capture only Slack warnings to warnings.txt
    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (msg?: unknown) => {
      warnings.push(String(msg ?? ''));
    };
    let sl = '';
    try {
      sl = await formatFor.slack(input);
    } finally {
      console.warn = origWarn;
    }
    const ln = await formatFor.linear(input);
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
