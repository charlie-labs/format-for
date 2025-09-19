import { describe, expect, test } from 'vitest';

import { formatFor } from '../../index.js';

describe('Linear HTML allowlist (sanitize/unwrap)', () => {
  test('keeps paragraph with only allowed tags', async () => {
    const input = '<u>keep</u><br />and more';
    const out = await formatFor(input, 'linear', {
      linearHtmlAllow: ['u', 'br'],
    });
    expect(out).toContain('\\<u>\\</u>keep');
    expect(out).toMatch(/\\<br\b/);
    expect(out).toContain('and more');
  });

  test('keeps HTML with no actual tags (comments/whitespace)', async () => {
    const input = '<!-- a comment -->';
    const out = await formatFor(input, 'linear');
    expect(out).toContain('<!-- a comment -->');
  });

  test('unwraps disallowed tags and preserves siblings', async () => {
    const input = [
      'before',
      '',
      '<u>ok</u><script>nope()</script>',
      '',
      'after',
    ].join('\n');
    const out = await formatFor(input, 'linear', { linearHtmlAllow: ['u'] });
    // Middle paragraph is kept; script removed; allowed tag preserved
    expect(out).not.toMatch(/<script>|nope\(\)/);
    expect(out).toContain('\\<u>\\</u>ok');
    // Adjacent paragraphs remain
    expect(out).toMatch(/before/);
    expect(out).toMatch(/after/);
  });
});
