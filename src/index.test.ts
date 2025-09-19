import { describe, expect, spyOn, test } from 'bun:test';

import { formatFor } from './index.js';

describe('formatFor', () => {
  async function withWarnSpy<T>(
    fn: (warn: ReturnType<typeof spyOn>) => Promise<T> | T
  ) {
    const warn = spyOn(console, 'warn');
    try {
      return await fn(warn);
    } finally {
      warn.mockRestore();
    }
  }

  test('github passthrough basics (bold/italic/strike)', async () => {
    const md = '# Title\n\nThis is **bold**, *italics*, and ~~strike~~.';
    const out = await formatFor(md, 'github');
    expect(out).toContain('# Title');
    expect(out).toContain('**bold**');
    expect(out).toContain('*italics*');
    expect(out).toContain('~~strike~~');
  });

  test('slack: headings become bold lines; links use <url|text>', async () => {
    const md = '# Hello\n\nSee [site](https://ex.com).';
    const out = await formatFor(md, 'slack');
    expect(out).toContain('*Hello*');
    expect(out).toContain('<https://ex.com|site>');
    // Ensure we did not emit >>>
    expect(out.includes('>>>')).toBe(false);
  });

  test('slack: tables => fenced code with warning', async () => {
    const md = `| a | b |\n| - | - |\n| 1 | 2 |`;
    await withWarnSpy(async (warn) => {
      const out = await formatFor(md, 'slack');
      expect(out.startsWith('```')).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        'Slack: table downgraded to code block'
      );
    });
  });

  test('slack: images are linkified with warning', async () => {
    const md = `![alt](https://img.example/x.png)`;
    await withWarnSpy(async (warn) => {
      const out = await formatFor(md, 'slack');
      expect(out.trim()).toBe('<https://img.example/x.png|alt>');
      expect(warn).toHaveBeenCalledWith('Slack: image converted to link');
    });
  });

  test('linear: details -> +++ fences and HTML stripping allowlist', async () => {
    const md = `<details><summary>More</summary>Body</details>\n\n<script>alert(1)</script><u>ok</u>`;
    const warn = spyOn(console, 'warn');
    const out = await formatFor(md, 'linear');
    expect(out).toContain('+++ More');
    expect(out).toContain('Body');
    expect(out).toContain('+++');
    // <u> kept, <script> stripped
    expect(out).toContain('<u>ok</u>');
    expect(out).not.toContain('<script>');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('slack: ~strike~ normalized', async () => {
    const md = 'This is ~gone~ text.';
    const outGithub = await formatFor(md, 'github');
    expect(outGithub).toContain('~~gone~~');
    const outSlack = await formatFor(md, 'slack');
    expect(outSlack).toContain('~gone~');
  });
});
