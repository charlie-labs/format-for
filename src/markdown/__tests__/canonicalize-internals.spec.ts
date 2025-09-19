import { type Root } from 'mdast';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';

import { remarkCanonicalizeMixed } from '../../markdown/plugins/canonicalize.js';

function run(tree: Root, opts?: Parameters<typeof remarkCanonicalizeMixed>[0]) {
  const p = unified().use(remarkCanonicalizeMixed, opts ?? ({} as never));
  return p.runSync(tree) as Root;
}

describe('remarkCanonicalizeMixed (internal)', () => {
  it('converts Slack angle links with label', () => {
    const tree: Root = {
      type: 'root',
      children: [{ type: 'html', value: '<https://ex.com|Ex>' } as any],
    };
    const out = run(tree);
    const link = out.children[0] as any;
    expect(link.type).toBe('link');
    expect(link.url).toBe('https://ex.com');
    expect(link.children?.[0]?.value).toBe('Ex');
  });

  it('converts Slack angle links without label', () => {
    const tree: Root = {
      type: 'root',
      children: [{ type: 'html', value: '<https://x.y>' } as any],
    };
    const out = run(tree);
    const link = out.children[0] as any;
    expect(link.type).toBe('link');
    expect(link.url).toBe('https://x.y');
  });

  it('treats Slack @user, <!special>, and <#channel|label> as links (current behavior)', () => {
    const root: Root = {
      type: 'root',
      children: [
        { type: 'html', value: '<@U999>' } as any,
        { type: 'html', value: '<!here>' } as any,
        { type: 'html', value: '<#C123|dev>' } as any,
      ],
    };
    const out = run(root);
    const a = out.children[0] as any;
    const b = out.children[1] as any;
    const c = out.children[2] as any;
    expect(a.type).toBe('link');
    expect(a.url).toBe('@U999');
    expect(b.type).toBe('link');
    expect(b.url).toBe('!here');
    expect(c.type).toBe('link'); // current behavior
    expect(c.children?.[0]?.value).toBe('dev');
  });
});
