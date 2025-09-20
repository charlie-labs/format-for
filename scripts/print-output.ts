/* eslint-disable no-console */
import { formatFor } from '../src/index.js';

const inputPath = Bun.argv[2];
type Target = 'linear' | 'slack' | 'github';
function isTarget(x: unknown): x is Target {
  return x === 'linear' || x === 'slack' || x === 'github';
}
const rawTarget = Bun.argv[3] ?? 'linear';
const target: Target = isTarget(rawTarget) ? rawTarget : 'linear';
if (!inputPath) {
  console.error(
    'usage: bun scripts/print-output.ts <path-to-md> [linear|slack|github]'
  );
  process.exit(1);
}

const text = await Bun.file(inputPath).text();
const out = await formatFor(text, target);
console.log(out);
