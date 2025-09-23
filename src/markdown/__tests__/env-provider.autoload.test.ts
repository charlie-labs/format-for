/* eslint-disable no-process-env */
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { createEnvDefaultsProvider, createFormatFor } from '../../index.js';

describe('env defaults provider (mocked APIs): no-network autoload', () => {
  const origEnv = { ...process.env };
  let prevFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    // Fresh env and mocks per test
    process.env = { ...origEnv };
    vi.restoreAllMocks();
    prevFetch = globalThis.fetch;
  });

  test('loads Slack users/channels and Linear users/keys via env; applies maps + autolinks', async () => {
    // Provide non-empty env so the provider attempts to load
    process.env['SLACK_BOT_TOKEN'] = 'x';
    process.env['LINEAR_API_KEY'] = 'y';

    // Stub fetch for Slack + Linear endpoints the provider hits
    const fetchStub = vi.fn(async (input: any, init?: any) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : String((input && 'url' in input && (input as any).url) ?? '');

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
        // Return a single response that includes org slug, team keys, and users
        if (
          q.includes('organization') &&
          q.includes('teams') &&
          q.includes('users')
        ) {
          return new Response(
            JSON.stringify({
              data: {
                organization: { slug: 'acme' },
                teams: { nodes: [{ key: 'ENG' }, { key: 'BOT' }] },
                users: {
                  nodes: [
                    {
                      id: 'U1',
                      name: 'Riley Tomasek',
                      displayName: 'Riley',
                      url: 'https://linear.app/acme/profiles/riley',
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

    try {
      globalThis.fetch = fetchStub as unknown as typeof globalThis.fetch;

      const provider = createEnvDefaultsProvider();
      const ff = createFormatFor({ defaults: provider });

      // Explicitly warm both sources to make behavior deterministic
      await provider.ensureFor('slack');
      await provider.ensureFor('linear');

      // Slack: snapshot should include users/channels from mocked API
      const snap = provider.snapshot();
      expect(Object.keys(snap.maps?.slack?.users ?? {}).length).toBeGreaterThan(
        0
      );
      expect(
        Object.keys(snap.maps?.slack?.channels ?? {}).length
      ).toBeGreaterThan(0);

      // GitHub: @riley should link to Linear profile using defaults
      const ghUser = await ff.github('hi @riley');
      expect(ghUser).toContain(
        '[Riley](https://linear.app/acme/profiles/riley)'
      );

      // GitHub: Linear issue autolink should be synthesized from team keys + org slug
      const ghIssue = await ff.github('See BOT-123');
      expect(ghIssue).toContain(
        '[BOT-123](https://linear.app/acme/issue/BOT-123)'
      );

      // Slack: @riley should become a real Slack mention when Slack users are loaded
      const slUser = await ff.slack('Hello @riley');
      expect(slUser).toContain('<@URILEY>');
    } finally {
      // Restore fetch
      globalThis.fetch = prevFetch as any;
    }
  });
});
