import { describe, expect, test } from 'vitest';

import { formatFor } from '../../index.js';

describe('target-aware @user resolution (case-insensitive)', () => {
  test('Slack uses Slack maps; GitHub/Linear use Linear maps', async () => {
    const input1 = 'Hello @riley';
    const input2 = 'Hello @RilEy';
    const maps = {
      slack: { users: { riley: { id: 'uRiley', label: 'Riley S' } } },
      linear: {
        users: {
          riley: {
            url: 'https://linear.app/acme/profiles/riley',
            label: 'Riley L',
          },
        },
      },
    } as const;

    const sl1 = await formatFor.slack(input1, { maps });
    const sl2 = await formatFor.slack(input2, { maps });
    expect(sl1).toContain('<@uRiley>');
    expect(sl2).toContain('<@uRiley>');

    const gh1 = await formatFor.github(input1, { maps });
    const gh2 = await formatFor.github(input2, { maps });
    expect(gh1).toContain('[Riley L](https://linear.app/acme/profiles/riley)');
    expect(gh2).toContain('[Riley L](https://linear.app/acme/profiles/riley)');

    const li = await formatFor.linear('Ping @RILEY', { maps });
    expect(li).toContain('[Riley L](https://linear.app/acme/profiles/riley)');
  });
});
