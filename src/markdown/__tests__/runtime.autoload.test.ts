/* eslint-disable no-process-env */
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { formatFor } from '../../index.js';
import {
  forceLoadNowForTests,
  resetRuntimeDefaultsForTests,
} from '../../runtime/defaults.js';

// Minimal happy-path end-to-end test exercising the env-backed loader.

describe('runtime: env-backed defaults loader', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...origEnv };
    resetRuntimeDefaultsForTests();
  });

  test('loads Slack users/channels and Linear teams/users; applies maps/autolinks per target', async () => {
    process.env['SLACK_BOT_TOKEN'] = 'x';
    process.env['LINEAR_API_KEY'] = 'y';

    // Fake fetch for Slack + Linear
    const fetchStub = vi.fn(async (input: any, init?: any) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : String(input?.url ?? '');
      if (url.includes('slack.com/api/users.list')) {
        return new Response(
          JSON.stringify({
            ok: true,
            members: [
              {
                id: 'URILEY',
                name: 'riley',
                real_name: 'Riley Tomasek',
                profile: {
                  display_name: 'Riley',
                  display_name_normalized: 'riley',
                },
              },
            ],
            response_metadata: { next_cursor: '' },
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('slack.com/api/conversations.list')) {
        return new Response(
          JSON.stringify({
            ok: true,
            channels: [
              { id: 'CDEV', name: 'dev', is_private: false },
              { id: 'COPS', name: 'ops', is_private: true },
            ],
            response_metadata: { next_cursor: '' },
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('api.linear.app/graphql')) {
        const body =
          typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        const q: string = body?.query ?? '';
        if (q.includes('teams(')) {
          // org + teams page
          return new Response(
            JSON.stringify({
              data: {
                organization: { urlKey: 'acme' },
                teams: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [
                    { id: 'T1', key: 'ENG', name: 'Engineering' },
                    { id: 'T2', key: 'BOT', name: 'Bots' },
                  ],
                },
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (q.includes('users(')) {
          // users page
          return new Response(
            JSON.stringify({
              data: {
                users: {
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [
                    {
                      id: 'U1',
                      name: 'Riley Tomasek',
                      displayName: 'Riley',
                      email: 'riley@example.com',
                      username: 'riley',
                    },
                  ],
                },
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ data: {} }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('not found', { status: 404 });
    });

    const prev = globalThis.fetch;
    try {
      globalThis.fetch = fetchStub as any;
      // Force-load now so we have deterministic behavior.
      await forceLoadNowForTests();

      // Slack target: @riley -> <@URILEY>; channels preserved via #name but not used here
      const slack = await formatFor.slack('Hello @riley');
      expect(slack).toContain('<@URILEY>');

      // Linear target: @riley -> [Riley](https://linear.app/acme/profiles/riley)
      const linear = await formatFor.linear('Hello @riley');
      expect(linear).toContain(
        '[Riley](https://linear.app/acme/profiles/riley)'
      );

      // GitHub target: BOT-123 autolink using combined team keys and org slug
      const gh = await formatFor.github('See BOT-123');
      expect(gh).toContain('[BOT-123](https://linear.app/acme/issue/BOT-123)');
    } finally {
      globalThis.fetch = prev;
    }
  });
});
