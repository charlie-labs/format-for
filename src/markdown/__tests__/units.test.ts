import { describe, expect, it } from 'vitest';

import { formatFor } from '../../index.js';
import { parseToCanonicalMdast } from '../../markdown/parse.js';
import { remarkCanonicalizeMixed } from '../../markdown/plugins/canonicalize.js';
import { renderGithub } from '../../markdown/renderers/github.js';
import { transformOutsideCode } from '../../markdown/utils/transformOutsideCode.js';

describe('canonicalize: ~strike~ ➜ delete nodes (multiple and trailing text)', () => {
  it('converts occurrences and preserves trailing text', async () => {
    const tree = parseToCanonicalMdast('a ~x~ b ~y~ c');
    // Render for GitHub should show ~~x~~ and ~~y~~
    const out = await formatFor('a ~x~ b ~y~ c', 'github');
    expect(out).toContain('~~x~~');
    expect(out).toContain('~~y~~');
    expect(out).toContain('a');
    expect(out).toContain('b');
    expect(out).toContain('c');
    // Tree sanity: there must be at least two delete nodes
    const deletes = JSON.stringify(tree).match(/"type":"delete"/g) ?? [];
    expect(deletes.length).toBeGreaterThanOrEqual(2);
  });
});

describe('transformOutsideCode: transforms only text nodes outside code', () => {
  it('replaces text outside code and leaves inline/code intact', () => {
    const md = 'before `CODE` after\n\n```\nBLOCK\n```';
    const tree = parseToCanonicalMdast(md);
    transformOutsideCode(tree, (s) => s.replace(/before/, 'AFTER'));
    const out = renderGithub(tree);
    expect(out).toContain('AFTER');
    expect(out).toContain('`CODE`');
    expect(out).toContain('```\nBLOCK\n```');
  });
});

describe('slack printer: mentions and inline html handling', () => {
  it('maps @here-like mentions and escapes angle forms', async () => {
    const md = 'ping @here and raw <@U1234>'; // keep angle form
    const out = await formatFor(md, 'slack');
    // The printer escapes text, so angle forms will be escaped
    expect(out).toContain('&lt;!here&gt;');
    expect(out).toContain('&lt;@U1234&gt;');
  });

  it('drops inline html that is not a Slack form (inner text may be kept by parser)', async () => {
    const md = 'a <i>x</i> b';
    const out = await formatFor(md, 'slack');
    // remark may surface inner text; we only require that no HTML tags remain
    expect(out).toBe('a x b');
  });

  it('renders task list markers', async () => {
    const md = '- [x] done\n- [ ] todo';
    const out = await formatFor(md, 'slack');
    expect(out).toContain('• [x] done');
    expect(out).toContain('• [ ] todo');
  });
});

describe('linear printer: autolinks and user maps', () => {
  it('applies an autolink rule and maps @user', async () => {
    const md = 'ticket ABC-123 assigned to @alice';
    const out = await formatFor(md, 'linear', {
      autolinks: {
        linear: [
          {
            pattern: /\b([A-Z]{3}-\d{3})\b/g,
            urlTemplate: 'https://t.example/$1',
            labelTemplate: 'JIRA $1',
          },
        ],
      },
      maps: {
        linear: {
          users: { alice: { url: 'https://x/alice', label: 'Alice A.' } },
        },
      },
    });
    expect(out).toContain('[JIRA ABC-123](https://t.example/ABC-123)');
    expect(out).toContain('[Alice A.](https://x/alice)');
  });
});

describe('canonicalize (direct): transforms ~a~b~c~ patterns inside text nodes', () => {
  it('replaces multiple segments and keeps surrounding text', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: 'pre ~a~ mid ~b~ end ~c~ tail' }],
        },
      ],
    } as const;
    const run = remarkCanonicalizeMixed();
    // @ts-expect-error using const as Root-ish for test purposes
    run(tree);
    const para = (tree.children[0] as any).children as any[];
    // Expect alternating text/delete/text/delete/text/delete/text
    const types = para.map((n) => n.type);
    expect(types).toEqual([
      'text',
      'delete',
      'text',
      'delete',
      'text',
      'delete',
      'text',
    ]);
  });
});
