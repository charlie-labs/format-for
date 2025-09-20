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

  test('Inside link labels (including nested formatting), literal "\\n" collapses to a space', async () => {
    const md = `See [A *B* C\\nD](https://ex.com) and also [X\\nY](https://ex.com)`;
    const expectGithub = await formatFor.github(md);
    const expectLinear = await formatFor.linear(md);
    const expectSlack = await formatFor.slack(md);

    // GitHub/Linear should keep formatting, and the label should not contain a literal "\\n".
    expect(expectGithub).not.toContain('\\n');
    expect(expectLinear).not.toContain('\\n');
    expect(expectGithub).toContain('[A *B* C D](https://ex.com)');
    expect(expectLinear).toContain('[A *B* C D](https://ex.com)');

    // Slack should render links with a label where the break became a space (no newline in label).
    expect(expectSlack).toContain('<https://ex.com|A _B_ C D>');
    expect(expectSlack).not.toMatch(/A _B_ C\nD/);
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
        const outGithub = await formatFor.github(input);
        const outLinear = await formatFor.linear(input);
        const outSlack = await formatFor.slack(input);
        expect(outGithub).not.toContain('\\n');
        expect(outLinear).not.toContain('\\n');
        expect(outSlack).not.toContain('\\n');
      }),
      { numRuns: 30, verbose: true, interruptAfterTimeLimit: 10000 }
    );
  });
});
