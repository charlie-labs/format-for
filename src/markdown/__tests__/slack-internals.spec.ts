import { type Content } from 'mdast';
import { describe, expect, it, vi } from 'vitest';

import { renderSlack } from '../../markdown/renderers/slack.js';

type MentionNode = {
  type: 'mention';
  data: { subtype: 'user' | 'channel' | 'special'; id: string; label?: string };
};

describe('renderSlack (internal): mention nodes', () => {
  it('prints user/channel/special mentions', () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const paragraph = {
      type: 'paragraph',
      children: [
        { type: 'text', value: 'hello ' },
        { type: 'mention', data: { subtype: 'user', id: 'U1' } },
        { type: 'text', value: ' ' },
        {
          type: 'mention',
          data: { subtype: 'channel', id: 'C2', label: 'dev' },
        },
        { type: 'text', value: ' ' },
        { type: 'mention', data: { subtype: 'special', id: 'here' } },
      ] as (Content | MentionNode)[],
    } as unknown as Content;
    const root = { type: 'root', children: [paragraph] } as unknown;
    const out = renderSlack(root);
    expect(out).toContain('hello <@U1> <#C2|dev> <!here>');
    warnSpy.mockRestore();
  });
});
