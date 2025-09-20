import { describe, expect, test } from 'vitest';

import { formatFor } from '../../index.js';

describe('Linear collapsible fences', () => {
  test('unterminated opener is treated as plain text', async () => {
    const input = ['Intro', '', '+++ Title', '', 'Body without close'].join(
      '\n'
    );

    const gh = await formatFor.github(input);
    expect(gh).toContain('+++ Title');
    expect(gh).not.toContain('<summary>Title</summary>');

    const linear = await formatFor.linear(input);
    expect(linear).toContain('+++ Title');
    expect(linear).toContain('Body without close');
    expect(linear).not.toContain('\n+++\n');
  });
});
