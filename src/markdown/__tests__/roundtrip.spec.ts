import { describe, expect, it } from 'vitest';

import { formatFor } from '../../index.js';

const SUPPORTED_CASES = [
  'Plain paragraph.',
  'Text with `inline` and **strong** and _emphasis_.',
  'Link: [label](https://example.com).',
  '- Item 1\n- Item 2',
  '```\ncode fence\n```',
];

describe('round-trip idempotency (supported constructs)', () => {
  for (const input of SUPPORTED_CASES) {
    it(`github idempotent: ${input.slice(0, 24)}`, async () => {
      const a = await formatFor(input, 'github');
      const b = await formatFor(a, 'github');
      expect(b).toBe(a);
    });

    // Slack formatting differs from Markdown semantics (e.g., strong/emphasis);
    // we only assert idempotency for GitHub/Linear here.

    it(`linear idempotent: ${input.slice(0, 24)}`, async () => {
      const a = await formatFor(input, 'linear');
      const b = await formatFor(a, 'linear');
      expect(b).toBe(a);
    });
  }
});
