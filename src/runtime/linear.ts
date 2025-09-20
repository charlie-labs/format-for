import { type AutoLinkRule } from '../markdown/types.js';

// ——— Linear ———

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

export type LinearBits = {
  orgSlug: string | undefined;
  teamKeys: string[];
  users: Record<string, { url: string; label?: string }>;
};

export async function loadLinearIndex(token: string): Promise<LinearBits> {
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
      const username = String(u.username ?? '')
        .trim()
        .toLowerCase();
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

export function buildLinearAutolinks(
  orgSlug: string | undefined,
  keys: string[]
): AutoLinkRule[] {
  if (!keys.length) return [];
  // Combine all team keys into a single regex for efficiency.
  const escapeRe = (s: string) => s.replace(/[\\^$.*+?()\[\]{}|]/g, '\\$&');
  const sorted = [...new Set(keys)].sort((a, b) => a.localeCompare(b));
  const source = `\\b(${sorted.map(escapeRe).join('|')})-(\\d+)\\b`;
  const pattern = new RegExp(source, 'g');
  const slug = orgSlug ?? '';
  const base = slug
    ? `https://linear.app/${slug}/issue/$1-$2`
    : `https://linear.app/issue/$1-$2`;
  return [{ pattern, urlTemplate: base }];
}
