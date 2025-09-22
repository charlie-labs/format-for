import { type Root } from 'mdast';
import { unified } from 'unified';
import { describe, expect, test } from 'vitest';

import { formatFor } from '../../index.js';
import { remarkCanonicalizeMixed } from '../../markdown/plugins/canonicalize.js';
import { renderLinear } from '../../markdown/renderers/linear.js';

describe('canonicalizer normalization paths (exercise branches)', () => {
  test('Slack angle forms, ~strike~, Linear @user mapping, details', async () => {
    const input = [
      'pre ~del~ <@U42> <#C77|dev> <!here> <https://ex.com|Ex> <https://b.co>',
      '',
      '+++ Title',
      '',
      'body',
      '',
      '@riley mentions',
    ].join('\n');

    const outSlack = await formatFor.slack(input, {
      maps: {
        linear: {
          users: {
            riley: { url: 'https://linear.app/u/riley', label: 'Riley' },
          },
        },
      },
    });
    expect(outSlack).toContain('<@U42>');
    expect(outSlack).toContain('<#C77|dev>');
    expect(outSlack).toContain('<!here>');
    expect(outSlack).toContain('<https://ex.com|Ex>');

    const outLinear = await formatFor.linear(input, {
      maps: {
        linear: {
          users: {
            riley: { url: 'https://linear.app/u/riley', label: 'Riley' },
          },
        },
      },
    });
    expect(outLinear).toContain('+++ Title');
    expect(outLinear).toContain('[Riley](https://linear.app/u/riley)');
  });

  test('autolink rules are applied', async () => {
    const input = 'Reference BOT-123 should link.';
    const out = await formatFor.github(input, {
      autolinks: {
        linear: [
          {
            pattern: /BOT-(\d+)/g,
            urlTemplate: 'https://linear.app/issue/BOT-$1',
            labelTemplate: 'BOT-$1',
          },
        ],
      },
    });
    expect(out).toContain('[BOT-123](https://linear.app/issue/BOT-123)');
  });

  test('autolinks apply inside text fragments adjacent to a Markdown link and a Slack mention', async () => {
    const input = [
      'Start [Ex](https://ex.com) BOT-234 end.',
      '<@U42> then BOT-345 after mention.',
    ].join('\n');
    const out = await formatFor.github(input, {
      autolinks: {
        linear: [
          {
            pattern: /BOT-(\d+)/g,
            urlTemplate: 'https://linear.app/issue/BOT-$1',
            labelTemplate: 'BOT-$1',
          },
        ],
      },
    });
    expect(out).toContain('[BOT-234](https://linear.app/issue/BOT-234)');
    expect(out).toContain('[BOT-345](https://linear.app/issue/BOT-345)');
  });

  test('autolinks are not created inside code, but still apply to adjacent text', async () => {
    const input = 'Use `code BOT-456` then BOT-567';
    const out = await formatFor.github(input, {
      autolinks: {
        linear: [
          {
            pattern: /BOT-(\d+)/g,
            urlTemplate: 'https://linear.app/issue/BOT-$1',
            labelTemplate: 'BOT-$1',
          },
        ],
      },
    });
    expect(out).toContain('`code BOT-456`');
    expect(out).toContain('[BOT-567](https://linear.app/issue/BOT-567)');
  });

  test('HTML visitor: <@U…|label> and <#C…> are canonicalized to mention nodes', () => {
    const root: Root = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'html', value: '<@U123|Alice>' }],
        },
        { type: 'paragraph', children: [{ type: 'html', value: '<#C456>' }] },
      ],
    };
    const out = unified().use(remarkCanonicalizeMixed).runSync(root) as Root;
    const p1 = out.children[0];
    const p2 = out.children[1];
    expect(
      p1 && p1.type === 'paragraph' && p1.children[0]?.type === 'mention'
    ).toBe(true);
    expect((p1 as any).children[0].data).toEqual({
      subtype: 'user',
      id: 'U123',
      label: 'Alice',
    });
    expect(
      p2 && p2.type === 'paragraph' && p2.children[0]?.type === 'mention'
    ).toBe(true);
    expect((p2 as any).children[0].data).toEqual({
      subtype: 'channel',
      id: 'C456',
    });
  });

  test('escaped Slack specials are preserved: &lt;!here&gt; -> <!here>', async () => {
    const input = 'ping &lt;!channel&gt; now';
    const gh = await formatFor.github(input);
    const sl = await formatFor.slack(input);
    const li = await formatFor.linear(input);
    expect(gh).toContain('@channel');
    expect(sl).toContain('<!channel>');
    expect(li).toContain('@channel');
  });

  test('Linear channel mention falls back to #<id> when no label is present', () => {
    const ast: Root = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'mention',
              data: { subtype: 'channel', id: 'C999' },
              children: [],
            } as any,
          ],
        },
      ],
    } as any;
    const out = renderLinear(ast, { allowHtml: [] });
    expect(out).toContain('#C999');
  });
});
