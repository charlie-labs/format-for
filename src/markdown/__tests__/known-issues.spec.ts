import { type Root } from 'mdast';
import { describe, expect, it, vi } from 'vitest';

import { formatFor } from '../../index.js';
import { parseToCanonicalMdast } from '../parse.js';

// These tests intentionally use `it.fails` to document known functional gaps/bugs
// raised in PR #7 review comments. They illustrate the desired behavior that the
// current implementation does not yet satisfy.

describe('known issues from review (illustrative tests)', () => {
  it.fails(
    'Parser: treats +++ inside fenced code as collapsible markers (should ignore inside code)',
    async () => {
      const input = [
        '```txt',
        'before',
        '+++ Title',
        'inside',
        '+++',
        'after',
        '```',
      ].join('\n');
      const gh = await formatFor(input, 'github');
      // Expectation: the literal lines "+++ Title" and closing "+++" should be preserved inside the code block
      expect(gh).toContain('+++ Title');
      expect(gh).toContain('\n+++\n');
    }
  );

  it.fails(
    'Slack: task list items should render [x]/[ ] based on listItem.checked',
    async () => {
      const input = '- [x] done\n- [ ] todo';
      const out = await formatFor(input, 'slack');
      expect(out).toContain('[x] done');
      expect(out).toContain('[ ] todo');
    }
  );

  it.fails(
    'Slack: link labels must be plain, escaped text (no markup characters)',
    async () => {
      const input =
        'See [*hello*](https://ex.com) and [_world_](https://ex.com)';
      const out = await formatFor(input, 'slack');
      // Desired: labels are flattened to plain text without * or _
      expect(out).toContain('<https://ex.com|hello>');
      expect(out).toContain('<https://ex.com|world>');
      // And should not leak markup chars inside label
      expect(out).not.toContain('<https://ex.com|*hello*>');
      expect(out).not.toContain('<https://ex.com|_world_>');
    }
  );

  it.fails(
    'Slack: heading downgrade should emit a one-time warning',
    async () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await formatFor('# Title', 'slack');
      const msgs = spy.mock.calls.map((c) => String(c[0] ?? ''));
      spy.mockRestore();
      expect(msgs.some((m) => m.includes('headings downgraded'))).toBe(true);
    }
  );

  it.fails(
    'GitHub renderer: converts nested details (details inside details body) to HTML recursively',
    async () => {
      const input = [
        '+++ Outer',
        '',
        'Text before',
        '',
        '+++ Inner',
        '',
        'Deep body',
        '',
        '+++',
        '',
        'After',
        '',
        '+++',
      ].join('\n');
      const out = await formatFor(input, 'github');
      // Desired: both outer and inner summaries appear as <details> blocks
      expect(out).toContain('<details><summary>Outer</summary>');
      expect(out).toContain('<details><summary>Inner</summary>');
    }
  );

  // Note: nested details/HTML recursion issues are covered for GitHub above; for Linear, the
  // allowlist permissiveness is covered by the attributes test further down.

  it.fails(
    'Canonicalizer: must not transform link labels (e.g., ~strike~) inside links',
    () => {
      const tree: Root = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'link',
                url: 'https://x',
                children: [{ type: 'text', value: 'see ~this~' }],
              },
            ],
          },
        ],
      };
      const out = parseToCanonicalMdast('', {} as any); // build empty to get shape
      // Swap in our paragraph manually to avoid relying on parser specifics
      (out as any).children = tree.children;
      const rendered = parseToCanonicalMdast('see [~this~](https://x)');
      // Expect no `delete` node inside the link label after canonicalization
      const hasDeleteInsideLink = JSON.stringify(rendered).includes('"delete"');
      expect(hasDeleteInsideLink).toBe(false);
    }
  );

  it.fails(
    'formatFor: unknown target should not silently fall back to GitHub',
    async () => {
      // Desired: throw on unknown targets to avoid masking configuration errors
      // @ts-expect-error intentional bad target for test
      await expect(formatFor('text', 'not-a-target')).rejects.toThrow();
    }
  );

  it.fails(
    'Linear renderer: HTML allowlist should not allow attributes (e.g., onclick) on allowed tags',
    async () => {
      const input = '<u onclick="x()">under</u>';
      const out = await formatFor(input, 'linear');
      expect(out).not.toContain('onclick');
    }
  );
});
