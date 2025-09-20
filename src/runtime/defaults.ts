/*
 * Runtime defaults loader
 * -----------------------
 *
 * Reads SLACK_BOT_TOKEN / LINEAR_API_KEY from process.env, fetches the minimal
 * directories we need (Slack users/channels, Linear org slug + teams + users),
 * and synthesizes in-memory maps and Linear autolink rules. The loader keeps a
 * per-process snapshot with simple TTLs and exposes a synchronous accessor used
 * by the formatters. No runtime deps; uses global fetch.
 */

/* eslint-disable no-console */
import { type AutoLinkRule, type MentionMaps } from '../markdown/types.js';

type Snapshot = {
  maps?: MentionMaps;
  autolinks?: { linear?: AutoLinkRule[] };
  loadedAt: number;
};

const SLACK_TTL_MS = 10 * 60_000; // 10m
const LINEAR_TTL_MS = 60 * 60_000; // 60m

let current: Snapshot | undefined;
let inflight: Promise<void> | undefined;
let lastSlackLoad = 0;
let lastLinearLoad = 0;

export function ensureRuntimeDefaults(): {
  maps?: MentionMaps;
  autolinks?: { linear?: AutoLinkRule[] };
} {
  const now = Date.now();
  const slackToken = safeEnv('SLACK_BOT_TOKEN');
  const linearToken = safeEnv('LINEAR_API_KEY');

  const needSlack = !!slackToken && now - lastSlackLoad > SLACK_TTL_MS;
  const needLinear = !!linearToken && now - lastLinearLoad > LINEAR_TTL_MS;

  if ((needSlack || needLinear) && !inflight) {
    inflight = (async () => {
      try {
        const [slackMaps, linearBits] = await Promise.all([
          needSlack && slackToken
            ? loadSlackCatalog(slackToken)
            : Promise.resolve<Partial<MentionMaps['slack']>>({}),
          needLinear && linearToken
            ? loadLinearIndex(linearToken)
            : Promise.resolve<LinearBits>({
                orgSlug: undefined,
                teamKeys: [],
                users: {},
              }),
        ]);

        const autolinks = buildLinearAutolinks(
          linearBits.orgSlug,
          linearBits.teamKeys
        );
        const mergedMaps: MentionMaps = {
          ...(current?.maps ?? {}),
          ...(slackMaps && Object.keys(slackMaps).length > 0
            ? { slack: slackMaps }
            : {}),
          ...(Object.keys(linearBits.users).length > 0
            ? { linear: { users: linearBits.users } }
            : {}),
        };

        current = {
          maps: mergedMaps,
          autolinks: { linear: autolinks },
          loadedAt: Date.now(),
        };
        if (needSlack) lastSlackLoad = Date.now();
        if (needLinear) lastLinearLoad = Date.now();
      } catch (err) {
        // Keep a best-effort model; failures shouldn't block formatting.
        console.warn('[format-for] defaults loader failed:', err);
      } finally {
        inflight = undefined;
      }
    })();
  }

  // Always return the latest snapshot synchronously; may be empty on first call
  // while the background load is still in flight.
  return { maps: current?.maps, autolinks: current?.autolinks };
}

// ——— Slack ———

async function loadSlackCatalog(
  token: string
): Promise<NonNullable<MentionMaps['slack']>> {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
  } as const;

  const users = await paginateSlackUsers(headers);
  const channels = await paginateSlackChannels(headers);

  const usersMap: Record<string, { id: string; label?: string }> = {};
  for (const u of users) {
    const id = String(u.id ?? '');
    if (!id) continue;
    const username = normalizeHandle(String(u.name ?? ''));
    const display = normalizeHandle(
      String(
        u.profile?.display_name_normalized ?? u.profile?.display_name ?? ''
      )
    );
    if (username) {
      usersMap[username] = {
        id,
        label: u.profile?.display_name ?? u.real_name,
      };
    }
    if (display) {
      usersMap[display] = { id, label: u.profile?.display_name ?? u.real_name };
    }
  }

  const channelsMap: Record<string, { id: string; label?: string }> = {};
  for (const c of channels) {
    const id = String(c.id ?? '');
    const name = normalizeChannel(String(c.name ?? ''));
    if (id && name) {
      channelsMap[name] = { id, label: name };
    }
  }

  return { users: usersMap, channels: channelsMap };
}

async function paginateSlackUsers(
  headers: Record<string, string>
): Promise<SlackUser[]> {
  const out: SlackUser[] = [];
  let cursor: string | undefined;
  do {
    const u = new URL('https://slack.com/api/users.list');
    if (cursor) u.searchParams.set('cursor', cursor);
    const res = await fetch(u, { headers });
    const json = (await res.json()) as SlackUsersListResponse;
    if (!json.ok) {
      throw new Error(
        `Slack API error for ${u}: ${String((json as Record<string, unknown>).error ?? 'unknown')}`
      );
    }
    const items = Array.isArray(json.members) ? json.members : [];
    out.push(...items);
    const next = json.response_metadata?.next_cursor;
    cursor = typeof next === 'string' && next.length > 0 ? next : undefined;
  } while (cursor);
  return out;
}

async function paginateSlackChannels(
  headers: Record<string, string>
): Promise<SlackChannel[]> {
  const out: SlackChannel[] = [];
  let cursor: string | undefined;
  do {
    const u = new URL(
      'https://slack.com/api/conversations.list?types=public_channel,private_channel&exclude_archived=true'
    );
    if (cursor) u.searchParams.set('cursor', cursor);
    const res = await fetch(u, { headers });
    const json = (await res.json()) as SlackChannelsListResponse;
    if (!json.ok) {
      throw new Error(
        `Slack API error for ${u}: ${String((json as Record<string, unknown>).error ?? 'unknown')}`
      );
    }
    const items = Array.isArray(json.channels) ? json.channels : [];
    out.push(...items);
    const next = json.response_metadata?.next_cursor;
    cursor = typeof next === 'string' && next.length > 0 ? next : undefined;
  } while (cursor);
  return out;
}

function normalizeHandle(s: string): string {
  return s.trim().toLowerCase();
}
function normalizeChannel(s: string): string {
  return s.trim().toLowerCase();
}

// ——— Linear ———

type LinearBits = {
  orgSlug: string | undefined;
  teamKeys: string[];
  users: Record<string, { url: string; label?: string }>;
};

async function loadLinearIndex(token: string): Promise<LinearBits> {
  const endpoint = 'https://api.linear.app/graphql';
  const headers = {
    Authorization: token,
    'Content-Type': 'application/json',
  } as const;

  // Fetch organization urlKey and all team keys
  const teamKeys: string[] = [];
  let orgSlug: string | undefined;
  let afterTeams: string | undefined;
  do {
    const query = `
      query OrgTeams($after: String) {
        organization { urlKey }
        teams(first: 250, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { id key name }
        }
      }
    `;
    const body = JSON.stringify({ query, variables: { after: afterTeams } });
    const res = await fetch(endpoint, { method: 'POST', headers, body });
    const json = (await res.json()) as LinearResponse<OrgTeamsData>;
    if (json.errors && json.errors.length) {
      throw new Error(
        `Linear GraphQL error: ${json.errors[0]?.message ?? 'unknown'}`
      );
    }
    const data = json.data;
    orgSlug = String(data?.organization?.urlKey ?? orgSlug ?? '');
    const nodes = data?.teams?.nodes ?? [];
    for (const t of nodes) {
      const key = String(t.key ?? '').trim();
      if (key) teamKeys.push(key);
    }
    const pi = data?.teams?.pageInfo;
    afterTeams = pi?.hasNextPage ? String(pi.endCursor ?? '') : undefined;
  } while (afterTeams);

  // Fetch all users; map by username/handle if available; fall back to email local-part.
  const users: Record<string, { url: string; label?: string }> = {};
  let afterUsers: string | undefined;
  do {
    const query = `
      query Users($after: String) {
        users(first: 250, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { id name displayName email username }
        }
      }
    `;
    const body = JSON.stringify({ query, variables: { after: afterUsers } });
    const res = await fetch(endpoint, { method: 'POST', headers, body });
    const json = (await res.json()) as LinearResponse<UsersData>;
    if (json.errors && json.errors.length) {
      throw new Error(
        `Linear GraphQL error: ${json.errors[0]?.message ?? 'unknown'}`
      );
    }
    const nodes = json?.data?.users?.nodes ?? [];
    for (const u of nodes) {
      const username = normalizeHandle(String(u.username ?? ''));
      const email = String(u.email ?? '');
      const by =
        username ||
        (email.includes('@') ? email.split('@', 1)[0]?.toLowerCase() : '');
      if (!by) continue;
      const label = String(u.displayName ?? u.name ?? by);
      const slug = orgSlug ?? '';
      const url = slug
        ? `https://linear.app/${slug}/profiles/${by}`
        : `https://linear.app/profiles/${by}`;
      users[by] = { url, label };
    }
    const pi = json?.data?.users?.pageInfo;
    afterUsers = pi?.hasNextPage ? String(pi.endCursor ?? '') : undefined;
  } while (afterUsers);

  return { orgSlug, teamKeys, users };
}

function buildLinearAutolinks(
  orgSlug: string | undefined,
  keys: string[]
): AutoLinkRule[] {
  if (!keys.length) return [];
  // Combine all team keys into a single regex for efficiency.
  const sorted = [...new Set(keys)].sort((a, b) => a.localeCompare(b));
  const source = `\\b(${sorted.join('|')})-(\\d+)\\b`;
  const pattern = new RegExp(source, 'g');
  const slug = orgSlug ?? '';
  const base = slug
    ? `https://linear.app/${slug}/issue/$1-$2`
    : `https://linear.app/issue/$1-$2`;
  return [{ pattern, urlTemplate: base }];
}

function safeEnv(key: string): string | undefined {
  try {
    const g = globalThis as {
      process?: { env?: Record<string, string | undefined> };
    };
    const v = g.process?.env?.[key];
    return typeof v === 'string' && v ? v : undefined;
  } catch {
    return undefined;
  }
}

// Exposed only for tests
export function resetRuntimeDefaultsForTests(): void {
  current = undefined;
  inflight = undefined;
  lastSlackLoad = 0;
  lastLinearLoad = 0;
}

export async function forceLoadNowForTests(): Promise<void> {
  const slackToken = safeEnv('SLACK_BOT_TOKEN');
  const linearToken = safeEnv('LINEAR_API_KEY');
  try {
    const [slackMaps, linearBits] = await Promise.all([
      slackToken ? loadSlackCatalog(slackToken) : Promise.resolve({}),
      linearToken
        ? loadLinearIndex(linearToken)
        : Promise.resolve<LinearBits>({
            orgSlug: undefined,
            teamKeys: [],
            users: {},
          }),
    ]);
    const autolinks = buildLinearAutolinks(
      linearBits.orgSlug,
      linearBits.teamKeys
    );
    const mergedMaps: MentionMaps = {
      ...(slackMaps && Object.keys(slackMaps).length > 0
        ? { slack: slackMaps }
        : {}),
      ...(Object.keys(linearBits.users).length > 0
        ? { linear: { users: linearBits.users } }
        : {}),
    };
    current = {
      maps: mergedMaps,
      autolinks: { linear: autolinks },
      loadedAt: Date.now(),
    };
    lastSlackLoad = Date.now();
    lastLinearLoad = Date.now();
  } catch (err) {
    console.warn('[format-for] test force-load failed:', err);
  }
}

// ——— Internal minimal types ———

type SlackUser = {
  id: string;
  name?: string;
  real_name?: string;
  profile?: {
    display_name?: string;
    display_name_normalized?: string;
  };
};

type SlackChannel = { id: string; name?: string };

type SlackListResponse = {
  ok: boolean;
  [key: string]: unknown;
  response_metadata?: { next_cursor?: string };
};

type SlackUsersListResponse = SlackListResponse & { members?: SlackUser[] };
type SlackChannelsListResponse = SlackListResponse & {
  channels?: SlackChannel[];
};

type OrgTeamsData = {
  organization?: { urlKey?: string };
  teams?: {
    pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
    nodes?: { id?: string; key?: string; name?: string }[];
  };
};

type UsersData = {
  users?: {
    pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
    nodes?: {
      id?: string;
      name?: string;
      displayName?: string;
      email?: string;
      username?: string;
    }[];
  };
};

type LinearResponse<T> = {
  data?: T;
  errors?: { message?: string }[];
};
