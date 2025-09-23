import { type MentionMaps } from '../markdown/types.js';

// ——— Slack ———

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

export async function loadSlackCatalog(
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
        `Slack API error for ${u}: ${String((json as Record<string, unknown>)['error'] ?? 'unknown')}`
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
        `Slack API error for ${u}: ${String((json as Record<string, unknown>)['error'] ?? 'unknown')}`
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
