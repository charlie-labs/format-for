import { describe, expect, test } from 'vitest';

import { type AutoLinkRule, createFormatFor } from '../../index.js';

describe('createFormatFor', () => {
  test('applies provider autolinks by default', async () => {
    const rules: AutoLinkRule[] = [
      {
        pattern: /ABC-(\d{2,5})/g,
        urlTemplate: 'https://example.com/issue/ABC-$1',
        labelTemplate: 'ABC-$1',
      },
    ];
    const ff = createFormatFor({
      defaults: {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        async ensureFor() {},
        snapshot() {
          return { autolinks: { linear: rules } };
        },
      },
    });
    const input = 'Ref ABC-123 and some text';
    const out = await ff.github(input);
    expect(out).toContain('[ABC-123](https://example.com/issue/ABC-123)');
  });

  test('caller options override provider maps and extend autolinks', async () => {
    const ff = createFormatFor({
      defaults: {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        async ensureFor() {},
        snapshot() {
          return {
            maps: {
              linear: {
                users: {
                  alice: {
                    url: 'https://linear.app/org/profile/alice',
                    label: 'Alice D',
                  },
                },
              },
            },
            autolinks: {
              linear: [
                {
                  pattern: /XYZ-(\d+)/g,
                  urlTemplate: 'https://x.test/$1',
                  labelTemplate: 'XYZ-$1',
                },
              ],
            },
          };
        },
      },
    });

    const input = '@alice also see XYZ-42';
    const out = await ff.linear(input, {
      maps: {
        linear: {
          users: {
            // override label/url for alice
            alice: { url: 'https://me.test/alice', label: 'A' },
            // and add another user to ensure additive merge
            bob: { url: 'https://me.test/bob', label: 'B' },
          },
        },
      },
      autolinks: {
        linear: [
          {
            pattern: /ABC-(\d+)/g,
            urlTemplate: 'https://a.test/$1',
            labelTemplate: 'ABC-$1',
          },
        ],
      },
    });

    // @alice should be linked using caller-supplied label
    expect(out).toContain('[A](https://me.test/alice)');
    // provider autolink should still apply, and caller rule appended
    expect(out).toContain('[XYZ-42](https://x.test/42)');
  });
});
