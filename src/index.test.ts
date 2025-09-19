import { expect, test } from 'bun:test';

import { formatFor } from './index.js';

test('formatFor basic passthrough for GitHub (GFM)', async () => {
  const input = '# Title\n\nParagraph.';
  const out = await formatFor(input, 'github');
  // GitHub renderer should keep heading marker
  expect(out).toContain('# Title');
  expect(out).toContain('Paragraph.');
});

test('formatFor supports GFM task lists for GitHub', async () => {
  const input = '- [x] done\n- [ ] todo';
  const out = await formatFor(input, 'github');
  expect(out).toContain('- [x] done');
  expect(out).toContain('- [ ] todo');
});

test('formatFor supports GFM tables for GitHub', async () => {
  const input = '| a | b |\n| - | - |\n| 1 | 2 |';
  const out = await formatFor(input, 'github');
  expect(out).toContain('| a | b |');
  expect(out).toContain('| 1 | 2 |');
});
