import { describe, expect, test } from 'vitest';

import { formatFor } from '../../index.js';

// These tests document currently-incorrect behavior. Where the failure mode is
// stable today, we use `test.fails` so the suite stays green but will start
// failing once the bug is fixed (prompting us to flip to a normal `test`).
// Where the behavior is flaky/ambiguous across remark versions, we mark it as
// `test.todo` to track without affecting CI.

describe('edge cases (documented failures)', () => {
  test.todo('canonicalizer: preserves trailing text after a match');

  test.todo(
    'autolinks: still apply when earlier fragments (e.g., Slack link) exist'
  );

  test.fails(
    'Linear HTML allowlist: mixed allowed + disallowed tags are sanitized',
    async () => {
      const input = '<u>ok</u><blink>nope</blink>';
      const out = await formatFor.linear(input);
      // Disallowed tag content is unwrapped/removed; allowed tag preserved.
      expect(out).not.toMatch(/<blink>|nope/);
      expect(out).toContain('<u>ok</u>');
    }
  );

  test.fails(
    'Slack link labels should be plain text (no formatting tokens)',
    async () => {
      const input = 'Check <https://ex.com|*Bold* _Em_>';
      const out = await formatFor.slack(input);
      // Expect sanitized label without `*` or `_` markers.
      expect(out).toContain('<https://ex.com|Bold Em>');
    }
  );

  test.todo('Slack: deep list flattening emits a single warning overall');
});
