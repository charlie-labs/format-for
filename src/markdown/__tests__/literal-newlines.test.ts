import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { formatFor } from '../../index.js';
import { renderSlack } from '../renderers/slack.js';

describe('literal "\\n" handling', () => {
  test('Slack renderer: mdast break renders as a newline', () => {
    const ast = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'Hello' },
            { type: 'break' },
            { type: 'text', value: 'world' },
          ],
        },
      ],
    } as any;
    const out = renderSlack(ast);
    expect(out).toContain('Hello\nworld');
  });

  test('Outputs never leak a literal "\\n" outside code/inlineCode', async () => {
    const safe = fc
      .string()
      .filter(
        (s) => !s.includes('```') && !s.includes('`') && !s.includes('\r')
      );

    await fc.assert(
      fc.asyncProperty(safe, async (s) => {
        const input = `A\\nB ${s}`;
        for (const t of ['github', 'linear', 'slack'] as const) {
          const out = await formatFor(input, t);
          expect(out).not.toContain('\\n');
        }
      }),
      { numRuns: 30, verbose: true, interruptAfterTimeLimit: 10000 }
    );
  });
});
