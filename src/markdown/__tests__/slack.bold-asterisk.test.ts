import { describe, expect, test } from 'vitest';

import { formatFor } from '../../index.js';
import { parseToCanonicalMdast } from '../../markdown/parse.js';

describe('Slack-formatted input: single-asterisk emphasis is bold', () => {
  test('example from issue #115 renders as requested', async () => {
    const input = 'This is a *great* <https://charlielabs.ai|product>.';

    const gh = await formatFor.github(input);
    const sl = await formatFor.slack(input);

    expect(gh).toBe('This is a **great** [product](https://charlielabs.ai).\n');
    expect(sl).toBe('This is a *great* <https://charlielabs.ai|product>.\n\n');
  });

  test('AST promotion: `*em*` -> strong when Slack-only tokens are present', () => {
    const input = 'Alpha *bold* and a link <https://ex.com|Ex>'; // contains Slack angle
    const ast = parseToCanonicalMdast(input);
    // Expect at least one strong node under the first paragraph
    const p = ast.children[0];
    expect(p && p.type === 'paragraph').toBe(true);
    if (p && p.type === 'paragraph') {
      const types = p.children.map((c) => c.type);
      expect(types).toContain('strong');
    }
  });

  test('Underscore-delimited emphasis stays italic (no promotion)', () => {
    const input = 'Keep _em_ italic even with Slack angle <https://ex.com|X>.';
    const ast = parseToCanonicalMdast(input);
    const p = ast.children[0];
    expect(p && p.type === 'paragraph').toBe(true);
    if (p && p.type === 'paragraph') {
      const types = p.children.map((c) => c.type);
      // Should have an emphasis node and no strong node produced by promotion
      expect(types).toContain('emphasis');
      expect(types).not.toContain('strong');
    }
  });

  test('Slack-like tokens inside code do not trigger bold promotion', () => {
    const input = `Please keep *em* italic when Slack tokens appear only in code.

\`inline <https://ex.com|X> and <@U123>\`

\`\`\`txt
See <https://ex.com|Y> and <@U999> here
\`\`\`
`;
    const ast = parseToCanonicalMdast(input);
    const p = ast.children[0];
    expect(p && p.type === 'paragraph').toBe(true);
    if (p && p.type === 'paragraph') {
      const types = p.children.map((c) => c.type);
      // Emphasis should remain as emphasis (no promotion to strong)
      expect(types).toContain('emphasis');
      expect(types).not.toContain('strong');
    }
  });
});
