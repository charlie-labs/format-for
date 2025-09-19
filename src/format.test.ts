import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { formatFor } from './index.js';

let warnSpy: { calls: string[] };
// eslint-disable-next-line no-console
const origWarn = console.warn;

beforeEach(() => {
  warnSpy = { calls: [] };
  // eslint-disable-next-line no-console
  console.warn = (...args: any[]) => {
    warnSpy.calls.push(String(args[0] ?? ''));
  };
});

afterEach(() => {
  // eslint-disable-next-line no-console
  console.warn = origWarn;
});

describe('formatFor basic', () => {
  test('renders across targets with mixed input', async () => {
    const input =
      '# Title\n\nHello ~world~ and <https://example.com|link> and <@U123>.';

    const gh = await formatFor(input, 'github');
    expect(gh).toContain('# Title');
    expect(gh).toContain('Hello ');
    expect(gh).toContain('~~world~~');
    expect(gh).toContain('<https://example.com|link>');
    expect(gh).toContain('@U123');

    const slack = await formatFor(input, 'slack');
    expect(slack).toContain('*Title*');
    expect(slack).toContain('Hello ~world~');

    const linear = await formatFor(input, 'linear');
    expect(linear).toContain('# Title');
    expect(linear).toContain('<https://example.com|link>');
  });
});

describe('warnings and downgrades', () => {
  test('tables warn on Slack', async () => {
    const input = `| a | b |\n| - | - |\n| 1 | 2 |\n`;
    const out = await formatFor(input, 'slack');
    expect(out).toContain('```');
    expect(warnSpy.calls).toEqual(['Slack: table downgraded to code block']);
  });

  // image handling varies; covered by separate focused tests in downstream packages
});

describe('collapsibles', () => {
  test('+++ Title -> details -> slack/linear', async () => {
    const input = '+++ Summary\n\nBody text';
    const slack = await formatFor(input, 'slack');
    expect(slack).toContain('*Summary*');
    expect(slack).toContain('> Body text');

    const linear = await formatFor(input, 'linear');
    expect(linear).toContain('+++ Summary');
    expect(linear).toContain('Body text');

    const gh = await formatFor(input, 'github');
    expect(gh).toContain('<details>');
    expect(gh).toContain('<summary>Summary</summary>');
  });
});

describe('code is sacrosanct', () => {
  test('inline and fenced code are unchanged', async () => {
    const input = 'Do not touch `~weird <code>~`\n\n```\n<@U123> ~strike~\n```';
    const slack = await formatFor(input, 'slack');
    expect(slack).toContain('`~weird <code>~`');
    expect(slack).toContain('```\n<@U123> ~strike~\n```');
  });
});
