/* eslint-disable no-console */
import { parseToCanonicalMdast } from '../src/markdown/parse.js';

const inputPath = Bun.argv[2];
if (!inputPath) {
  console.error('usage: bun scripts/print-ast.ts <path-to-md>');
  process.exit(1);
}
const text = await Bun.file(inputPath).text();
const ast = parseToCanonicalMdast(text);
console.log(JSON.stringify(ast, null, 2));
