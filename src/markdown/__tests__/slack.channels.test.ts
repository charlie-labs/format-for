import { describe, expect, test } from 'vitest';

import { renderSlack } from '../renderers/slack.js';

function root(children: any[]): any {
  return { type: 'root', children } as any;
}

describe('Slack channel mentions', () => {
  test('unlabeled channel mention emits <#ID>', () => {
    const ast = root([
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'Go to ' },
          {
            type: 'mention',
            data: { subtype: 'channel', id: 'C123' },
            children: [],
          },
        ],
      },
    ]);
    const out = renderSlack(ast as any);
    expect(out).toContain('<#C123>');
  });
});
