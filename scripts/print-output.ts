/* eslint-disable no-console */
import { formatFor } from '../src/index.js';

const inputPath = Bun.argv[2];
const target = (Bun.argv[3] ?? 'linear') as 'linear' | 'slack' | 'github';
if (!inputPath) {
  console.error(
    'usage: bun scripts/print-output.ts <path-to-md> [linear|slack|github]'
  );
  process.exit(1);
}

const text = await Bun.file(inputPath).text();
const out = await formatFor(text, target);
console.log(out);
