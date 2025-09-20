import { describe, expect, test } from 'vitest';

import { formatFor } from '../../index.js';

describe('Linear HTML allowlist (strict)', () => {
  test('keeps paragraph with only allowed tags', async () => {
    const input = '<u>keep</u><br />and more';
    const out = await formatFor.linear(input);
    expect(out).toContain('<u>keep</u>');
    expect(out).toMatch(/<br\b/);
    expect(out).toContain('and more');
  });

  test('keeps HTML with no actual tags (comments/whitespace)', async () => {
    const input = '<!-- a comment -->';
    const out = await formatFor.linear(input);
    expect(out).toContain('<!-- a comment -->');
  });

  test('strips the entire paragraph when any disallowed tag appears and preserves siblings', async () => {
    const input = [
      'before',
      '',
      '<u>ok</u><script>nope()</script>',
      '',
      'after',
    ].join('\n');
    const out = await formatFor.linear(input);
    // Middle paragraph removed entirely
    expect(out).not.toMatch(/<script>|nope\(\)/);
    expect(out).not.toContain('ok');
    // Adjacent paragraphs remain
    expect(out).toMatch(/before/);
    expect(out).toMatch(/after/);
  });
});
