import { describe, expect, test, vi } from 'vitest';

import { createFormatFor, formatFor } from '../../index.js';
import { renderGithub } from '../../markdown/renderers/github.js';
import { renderSlack } from '../../markdown/renderers/slack.js';
import {
  type DefaultsProvider,
  type FormatTarget,
} from '../../markdown/types.js';

function root(children: any[]): any {
  return { type: 'root', children } as any;
}

describe('v1 options: warnings + target knobs + factory defaults', () => {
  test('Slack lists: maxDepth parameter controls flattening + single warning', () => {
    const ast = root([
      {
        type: 'list',
        ordered: false,
        spread: false,
        children: [
          {
            type: 'listItem',
            children: [
              { type: 'paragraph', children: [{ type: 'text', value: 'a' }] },
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
                        children: [{ type: 'text', value: 'b' }],
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
                                children: [{ type: 'text', value: 'c' }],
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
    ]);
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const out = renderSlack(ast, {
      target: { slack: { lists: { maxDepth: 2 } } },
    });
    expect(out).toContain('• a');
    expect(out).toContain('   • b');
    expect(out).toContain('   → c');
    expect(
      warnSpy.mock.calls.filter((c) =>
        String(c[0]).includes('flattened list depth > 2')
      ).length
    ).toBe(1);
    warnSpy.mockRestore();
  });

  test('Slack images: style=link vs url and emptyAltLabel fallback', () => {
    const ast = root([
      { type: 'image', url: 'https://img', alt: '' },
      {
        type: 'paragraph',
        children: [{ type: 'image', url: 'https://inline', alt: 'Alt' }],
      },
    ]);
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const linkOut = renderSlack(ast, {
      target: { slack: { images: { style: 'link', emptyAltLabel: 'image' } } },
    });
    expect(linkOut).toContain('<https://img|image>');
    expect(linkOut).toContain('<https://inline|Alt>');

    const urlOut = renderSlack(ast, {
      target: { slack: { images: { style: 'url', emptyAltLabel: 'pic' } } },
    });
    expect(urlOut).toContain('https://img');
    expect(urlOut).not.toContain('<https://img|');
    expect(urlOut).toContain('https://inline');
    warnSpy.mockRestore();
  });

  test('GitHub breaks: two-spaces vs backslash', () => {
    const ast = root([
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'A' },
          { type: 'break' },
          { type: 'text', value: 'B' },
        ],
      },
    ]);
    const def = renderGithub(ast);
    expect(def).toContain('A  \nB');
    const bs = renderGithub(ast, {
      target: { github: { breaks: 'backslash' } },
    });
    expect(bs).toContain('A\\\nB');
  });

  test('warnings routing: silent mode mutes console.warn but invokes onWarn()', async () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const hits: string[] = [];
    const md = '![x](https://img)';
    const out = await formatFor.slack(md, {
      warnings: { mode: 'silent', onWarn: (m) => hits.push(m) },
    });
    expect(out).toContain('https://img'); // default link style
    expect(warnSpy).not.toHaveBeenCalled();
    expect(hits.some((m) => m.includes('images emitted as links'))).toBe(true);
    warnSpy.mockRestore();
  });

  test('createFormatFor: provider autolinks merge + dedupe', async () => {
    const provider: DefaultsProvider = {
      async ensureFor(_t: FormatTarget) {
        return;
      },
      snapshot() {
        return {
          autolinks: {
            linear: [
              {
                pattern: /ABC-(\d+)/g,
                urlTemplate: 'https://x/A$1',
                labelTemplate: 'ABC-$1',
              },
            ],
          },
        };
      },
    };
    const ff = createFormatFor({ defaults: provider });
    const md = 'Ticket ABC-42.';
    const out = await ff.github(md, {
      // Duplicate rule provided by caller — should be deduped
      autolinks: {
        linear: [
          {
            pattern: /ABC-(\d+)/g,
            urlTemplate: 'https://x/A$1',
            labelTemplate: 'ABC-$1',
          },
        ],
      },
    });
    expect(out).toContain('[ABC-42](https://x/A42)');
  });

  test('Slack images: missing/empty URL falls back to label for both styles', () => {
    const ast = root([
      { type: 'image', url: '', alt: 'Block' },
      {
        type: 'paragraph',
        children: [{ type: 'image', url: '   ', alt: 'Inline' }],
      },
    ]);
    const link = renderSlack(ast, {
      target: { slack: { images: { style: 'link' } } },
    });
    expect(link).toContain('Block');
    expect(link).toContain('Inline');
    expect(link).not.toContain('<|');

    const urlStyle = renderSlack(ast, {
      target: { slack: { images: { style: 'url' } } },
    });
    expect(urlStyle).toContain('Block');
    expect(urlStyle).toContain('Inline');
    expect(urlStyle).not.toContain('<|');
  });
});
