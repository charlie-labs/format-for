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
});
