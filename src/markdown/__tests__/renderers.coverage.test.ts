import { describe, expect, test } from 'vitest';

import { renderGithub } from '../../markdown/renderers/github.js';
import { renderLinear } from '../../markdown/renderers/linear.js';
import { renderSlack } from '../../markdown/renderers/slack.js';

function root(children: any[]): any {
  return { type: 'root', children } as any;
}

describe('renderers: branch coverage', () => {
  test('slack renders all node types and warns appropriately', () => {
    const ast = root([
      { type: 'heading', depth: 2, children: [{ type: 'text', value: 'H' }] },
      { type: 'paragraph', children: [{ type: 'text', value: 'para' }] },
      {
        type: 'blockquote',
        children: [
          { type: 'paragraph', children: [{ type: 'text', value: 'q' }] },
        ],
      },
      {
        type: 'list',
        ordered: false,
        spread: true,
        children: [
          {
            type: 'listItem',
            children: [
              { type: 'paragraph', children: [{ type: 'text', value: 'a' }] },
              { type: 'code', lang: null, value: 'block-in-list' },
            ],
          },
          {
            type: 'listItem',
            children: [
              { type: 'paragraph', children: [{ type: 'text', value: 'b' }] },
              {
                type: 'list',
                ordered: false,
                spread: false,
                children: [
                  {
                    type: 'listItem',
                    children: [
                      {
                        type: 'paragraph',
                        children: [{ type: 'text', value: 'c' }],
                      },
                      {
                        type: 'list',
                        ordered: false,
                        spread: false,
                        children: [
                          {
                            type: 'listItem',
                            children: [
                              {
                                type: 'paragraph',
                                children: [{ type: 'text', value: 'd' }],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      { type: 'thematicBreak' },
      { type: 'code', lang: null, value: 'x' },
      {
        type: 'table',
        children: [
          {
            type: 'tableRow',
            children: [
              { type: 'tableCell', children: [{ type: 'text', value: 'c1' }] },
              { type: 'tableCell', children: [{ type: 'text', value: 'c2' }] },
            ],
          },
        ],
      },
      { type: 'image', url: 'https://img', alt: 'a' },
      { type: 'html', value: '<u>u</u>' },
      {
        type: 'paragraph',
        children: [
          { type: 'emphasis', children: [{ type: 'text', value: 'e' }] },
          { type: 'strong', children: [{ type: 'text', value: 's' }] },
          { type: 'delete', children: [{ type: 'text', value: 'd' }] },
          { type: 'inlineCode', value: 'ic' },
          {
            type: 'link',
            url: 'https://x',
            title: null,
            children: [{ type: 'text', value: 'X' }],
          },
          {
            type: 'mention',
            data: { subtype: 'user', id: 'U1' },
            children: [],
          },
          {
            type: 'mention',
            data: { subtype: 'channel', id: 'C1', label: 'ch' },
            children: [],
          },
          {
            type: 'mention',
            data: { subtype: 'special', id: 'here' },
            children: [],
          },
        ],
      },
    ]);
    const out = renderSlack(ast as any);
    expect(out).toContain('*H*');
    expect(out).toContain('> q');
    expect(out).toContain('```');
    expect(out).toContain('<https://x|X>');
    expect(out).toContain('<@U1>');
    expect(out).toContain('<#C1|ch>');
    expect(out).toContain('<!here>');
  });

  test('github transforms details and mentions', () => {
    const ast = root([
      {
        type: 'details',
        data: { summary: 'S' },
        children: [
          { type: 'paragraph', children: [{ type: 'text', value: 'b' }] },
        ],
      },
      {
        type: 'paragraph',
        children: [
          {
            type: 'mention',
            data: { subtype: 'user', id: 'U', label: 'L' },
            children: [],
          },
          {
            type: 'mention',
            data: { subtype: 'user', id: 'U2' },
            children: [],
          },
          {
            type: 'mention',
            data: { subtype: 'channel', id: 'C', label: 'dev' },
            children: [],
          },
          {
            type: 'mention',
            data: { subtype: 'channel', id: 'C2' },
            children: [],
          },
          {
            type: 'mention',
            data: { subtype: 'special', id: 'everyone' },
            children: [],
          },
          { type: 'mention', data: { subtype: 'special' }, children: [] },
        ],
      },
    ]);
    const out = renderGithub(ast as any);
    expect(out).toContain('<summary>S</summary>');
    expect(out).toContain('@L');
    expect(out).toContain('#dev');
    expect(out).toContain('@everyone');
    expect(out).toContain('@U2');
    expect(out).toContain('#channel');
  });

  test('linear transforms details, mentions, and strips html', () => {
    const ast = root([
      {
        type: 'details',
        data: { summary: 'S' },
        children: [
          { type: 'paragraph', children: [{ type: 'text', value: 'b' }] },
        ],
      },
      { type: 'html', value: '<blink>nope</blink>' },
      {
        type: 'paragraph',
        children: [
          {
            type: 'mention',
            data: { subtype: 'user', label: 'Foo' },
            children: [],
          },
          {
            type: 'mention',
            data: { subtype: 'channel', label: 'bar', id: 'C1' },
            children: [],
          },
          {
            type: 'mention',
            data: { subtype: 'special', id: 'here' },
            children: [],
          },
        ],
      },
    ]);
    const out = renderLinear(ast as any, { allowHtml: ['u', 'br'] });
    expect(out).toContain('+++ S');
    expect(out).toContain('\n+++');
    expect(out).not.toContain('<blink>');
    expect(out).toContain('@Foo');
    expect(out).toContain('#bar');
    expect(out).toContain('@here');
  });
});
