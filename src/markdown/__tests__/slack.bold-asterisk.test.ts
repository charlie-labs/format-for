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
});
