import { describe, expect, test } from 'vitest';

import { renderSlack } from '../renderers/slack.js';

function root(children: any[]): any {
  return { type: 'root', children } as any;
}

describe('slack: link/image label escaping', () => {
  test('escapes `|` in link labels without double-escaping & < >', () => {
    const ast = root([
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            url: 'https://x',
            title: null,
            children: [{ type: 'text', value: 'A|B & < >' }],
          },
        ],
      },
    ]);
    const out = renderSlack(ast as any);
    expect(out).toContain('<https://x|A&#124;B &amp; &lt; &gt;>');
  });

  test('escapes `|` and & < > in image alt text used as label', () => {
    const ast = root([
      {
        type: 'image',
        url: 'https://img',
        alt: 'A|B & < >',
      },
    ]);
    const out = renderSlack(ast as any);
    expect(out).toContain('<https://img|A&#124;B &amp; &lt; &gt;>');
  });

  test('image with missing/empty URL falls back to plain, escaped label (no `<|label>`)', () => {
    const ast = root([
      {
        type: 'image',
        // Simulate a malformed/empty URL field flowing through
        url: '',
        alt: 'Pic | & <>',
      },
      {
        type: 'paragraph',
        children: [
          {
            type: 'image',
            url: '   ', // whitespace-only should be treated as missing
            alt: 'Inline',
          },
        ],
      },
    ]);
    const out = renderSlack(ast as any, {
      target: { slack: { images: { style: 'link' } } },
    });
    // Falls back to escaped label text, not `<|label>`
    expect(out).toContain('Pic &#124; &amp; &lt;&gt;');
    expect(out).not.toContain('<|');
    expect(out).toContain('Inline');
  });

  test('inline link: missing/whitespace URL falls back to label; URLs are trimmed', () => {
    const ast = root([
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            url: '',
            children: [{ type: 'text', value: 'No URL' }],
          },
          { type: 'text', value: ' and ' },
          {
            type: 'link',
            url: '   ',
            children: [{ type: 'text', value: 'Spaces' }],
          },
          { type: 'text', value: ' and ' },
          {
            type: 'link',
            url: '  https://trim.me  ',
            children: [{ type: 'text', value: 'Trim' }],
          },
        ],
      },
    ]);
    const out = renderSlack(ast as any);
    // Falls back to label when URL is empty/whitespace
    expect(out).toContain('No URL');
    expect(out).toContain('Spaces');
    expect(out).not.toContain('<|');
    // Trims surrounding whitespace in URLs
    expect(out).toContain('<https://trim.me|Trim>');
  });

  test('inline link: empty label renders as bare URL', () => {
    const ast = root([
      {
        type: 'paragraph',
        children: [
          { type: 'link', url: 'https://example.com', children: [] },
          { type: 'text', value: ' and ' },
          {
            type: 'link',
            url: ' https://example.com ',
            children: [{ type: 'text', value: '' }],
          },
        ],
      },
    ]);
    const out = renderSlack(ast as any);
    expect(out).toContain('<https://example.com>');
    expect(out).not.toContain('<https://example.com|>');
  });

  test('inline link: whitespace-only label renders as bare URL (trim-aware check)', () => {
    const ast = root([
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            url: ' https://ex.com ',
            // label is whitespace-only; should be treated as empty
            children: [{ type: 'text', value: '   ' }],
          },
        ],
      },
    ]);
    const out = renderSlack(ast as any);
    expect(out).toContain('<https://ex.com>');
    expect(out).not.toContain('<https://ex.com|');
  });

  test('image: empty label renders as bare URL (no `<url|>`) when `emptyAltLabel` is empty', () => {
    const ast = root([
      { type: 'image', url: 'https://img', alt: '' },
      {
        type: 'paragraph',
        children: [{ type: 'image', url: ' https://inline ', alt: '' }],
      },
    ]);
    const out = renderSlack(ast as any, {
      target: { slack: { images: { style: 'link', emptyAltLabel: '' } } },
    });
    expect(out).toContain('<https://img>');
    expect(out).toContain('<https://inline>');
    expect(out).not.toContain('<https://img|>');
    expect(out).not.toContain('<https://inline|>');
  });

  test('image: whitespace-only alt renders as bare URL (no `<url|>`) when `emptyAltLabel` is empty', () => {
    const ast = root([{ type: 'image', url: 'https://img', alt: '   ' }]);
    const out = renderSlack(ast as any, {
      target: { slack: { images: { style: 'link', emptyAltLabel: '' } } },
    });
    expect(out).toContain('<https://img>');
    expect(out).not.toContain('<https://img|>');
  });
});
