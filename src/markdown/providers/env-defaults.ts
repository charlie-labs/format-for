import {
  type AutoLinkRule,
  type DefaultsProvider,
  type FormatTarget,
  type MentionMaps,
} from '../types.js';
import { type Cache, InMemoryCache } from '../utils/cache.js';

function errMsg(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

type SlackSnapshotV1 = {
  users: Record<string, { id: string; label?: string }>;
  channels: Record<string, { id: string; label?: string }>;
  loadedAt: number; // epoch ms
};

type LinearSnapshotV1 = {
  orgSlug?: string;
  teamKeys: string[];
  users: Record<string, { url: string; label?: string }>;
  loadedAt: number; // epoch ms
};

export function createEnvDefaultsProvider(cfg?: {
  cache?: Cache;
  namespace?: string;
  slack?: { token?: string; ttlMs?: number };
  linear?: { apiKey?: string; ttlMs?: number };
  onError?: (msg: string) => void;
}): DefaultsProvider {
  const cache: Cache = cfg?.cache ?? new InMemoryCache();
  const ns =
    (cfg?.namespace ?? 'format-for:defaults:v1').replace(/\s+/g, '') ||
    'format-for:defaults:v1';

  const slackTtl = Math.max(1, cfg?.slack?.ttlMs ?? 10 * 60_000);
  const linearTtl = Math.max(1, cfg?.linear?.ttlMs ?? 60 * 60_000);
  // eslint-disable-next-line no-process-env
  const slackToken = cfg?.slack?.token ?? process.env['SLACK_BOT_TOKEN'];
  // eslint-disable-next-line no-process-env
  const linearKey = cfg?.linear?.apiKey ?? process.env['LINEAR_API_KEY'];
  const onError =
    cfg?.onError ??
    ((m: string) => {
      // Intentionally no-op by default; reference param to satisfy lint
      if (m) return;
    });

  const keySlack = `${ns}:slack:snapshot:v1`;
  const keyLinear = `${ns}:linear:snapshot:v1`;

  // In-memory latest snapshots to satisfy synchronous snapshot() calls
  let slackSnap: SlackSnapshotV1 | undefined;
  let linearSnap: LinearSnapshotV1 | undefined;

  // Inflight fetch coalescing per source
  let inflightSlack: Promise<void> | undefined;
  let inflightLinear: Promise<void> | undefined;

  async function ensureSlack(): Promise<void> {
    // Short-circuit if we have a fresh in-memory snapshot
    if (slackSnap && Date.now() - slackSnap.loadedAt < slackTtl) return;

    // Try cache
    try {
      const fromCache = await cache.get<SlackSnapshotV1>(keySlack);
      if (fromCache) {
        slackSnap = fromCache;
        const age = Date.now() - fromCache.loadedAt;
        if (age < slackTtl) return; // fresh
        // stale-while-revalidate: kick background refresh and return
        void refreshSlack();
        return;
      }
    } catch (err) {
      onError(`defaults: slack cache get failed: ${errMsg(err)}`);
    }

    // No cache: block and fetch once
    await refreshSlack();
  }

  async function refreshSlack(): Promise<void> {
    if (inflightSlack) return inflightSlack;
    inflightSlack = (async () => {
      if (!slackToken) {
        // No token; leave snapshot undefined and silently succeed
        return;
      }
      try {
        const users = await fetchAllSlackUsers(slackToken);
        const channels = await fetchAllSlackChannels(slackToken);
        const snap: SlackSnapshotV1 = {
          users,
          channels,
          loadedAt: Date.now(),
        };
        slackSnap = snap;
        try {
          await cache.set(keySlack, snap, { ttlMs: slackTtl });
        } catch (err) {
          onError(`defaults: slack cache set failed: ${errMsg(err)}`);
        }
      } catch (err) {
        onError(`defaults: slack fetch failed: ${errMsg(err)}`);
      } finally {
        inflightSlack = undefined;
      }
    })();
    return inflightSlack;
  }

  async function ensureLinear(): Promise<void> {
    if (linearSnap && Date.now() - linearSnap.loadedAt < linearTtl) return;

    try {
      const fromCache = await cache.get<LinearSnapshotV1>(keyLinear);
      if (fromCache) {
        linearSnap = fromCache;
        const age = Date.now() - fromCache.loadedAt;
        if (age < linearTtl) return;
        void refreshLinear();
        return;
      }
    } catch (err) {
      onError(`defaults: linear cache get failed: ${errMsg(err)}`);
    }

    await refreshLinear();
  }

  async function refreshLinear(): Promise<void> {
    if (inflightLinear) return inflightLinear;
    inflightLinear = (async () => {
      if (!linearKey) {
        return;
      }
      try {
        const lin = await fetchLinearDefaults(linearKey);
        const snap: LinearSnapshotV1 = {
          orgSlug: lin.orgSlug,
          teamKeys: lin.teamKeys,
          users: lin.users,
          loadedAt: Date.now(),
        };
        linearSnap = snap;
        try {
          await cache.set(keyLinear, snap, { ttlMs: linearTtl });
        } catch (err) {
          onError(`defaults: linear cache set failed: ${errMsg(err)}`);
        }
      } catch (err) {
        onError(`defaults: linear fetch failed: ${errMsg(err)}`);
      } finally {
        inflightLinear = undefined;
      }
    })();
    return inflightLinear;
  }

  function toMapsAndLinks(): Readonly<{
    maps?: MentionMaps;
    autolinks?: Partial<Record<FormatTarget, AutoLinkRule[]>>;
  }> {
    const maps: MentionMaps = {};
    if (slackSnap) {
      maps.slack = {};
      if (Object.keys(slackSnap.users).length > 0) {
        maps.slack.users = slackSnap.users;
      }
      if (Object.keys(slackSnap.channels).length > 0) {
        maps.slack.channels = slackSnap.channels;
      }
    }
    if (linearSnap) {
      if (Object.keys(linearSnap.users).length > 0) {
        maps.linear = { users: linearSnap.users };
      }
    }
    const autolinks: Partial<Record<FormatTarget, AutoLinkRule[]>> = {};
    if (linearSnap && linearSnap.orgSlug && linearSnap.teamKeys.length > 0) {
      const escaped = linearSnap.teamKeys
        .filter(Boolean)
        .map((k) => String(k).trim())
        .filter((k) => k.length > 0)
        .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      if (escaped.length > 0) {
        const re = new RegExp(`\\b(?:${escaped.join('|')})-\\d+\\b`, 'g');
        const urlTemplate = `https://linear.app/${linearSnap.orgSlug}/issue/$0`;
        autolinks.linear = [{ pattern: re, urlTemplate }];
      }
    }
    const out: {
      maps?: MentionMaps;
      autolinks?: Partial<Record<FormatTarget, AutoLinkRule[]>>;
    } = {};
    if (Object.keys(maps).length > 0) {
      out.maps = maps;
    }
    const hasAnyAutolinks = Object.values(autolinks).some(
      (arr): arr is AutoLinkRule[] => Array.isArray(arr) && arr.length > 0
    );
    if (hasAnyAutolinks) {
      out.autolinks = autolinks;
    }
    return out;
  }

  return {
    async ensureFor(target) {
      switch (target) {
        case 'slack':
          await ensureSlack();
          break;
        case 'linear':
          await ensureLinear();
          break;
        case 'github':
        default:
          // No defaults needed for GitHub
          break;
      }
    },
    snapshot() {
      return toMapsAndLinks();
    },
  } satisfies DefaultsProvider;
}

// ——— Slack helpers ———
async function fetchAllSlackUsers(
  token: string
): Promise<SlackSnapshotV1['users']> {
  const users: Record<string, { id: string; label?: string }> = {};
  let cursor: string | undefined;
  for (let page = 0; page < 50; page++) {
    const url = new URL('https://slack.com/api/users.list');
    url.searchParams.set('limit', '200');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Slack users.list ${res.status}`);
    const raw = (await res.json()) as unknown;
    const data = asRecord(raw);
    if (data['ok'] !== true) {
      const errRec = asRecord(data);
      const msgVal = errRec['error'];
      const msg = typeof msgVal === 'string' && msgVal ? msgVal : 'unknown';
      throw new Error(`Slack users.list error: ${msg}`);
    }
    const memRaw = data['members'];
    const members = Array.isArray(memRaw) ? (memRaw as unknown[]) : [];
    for (const mm of members) {
      const m = asRecord(mm);
      const id = String(m['id'] ?? '');
      if (!id) continue;
      const name = String(m['name'] ?? '').trim();
      const profile = asRecord(m['profile']);
      const label =
        String(
          (profile['display_name'] as string | undefined) ||
            (profile['real_name'] as string | undefined) ||
            name ||
            ''
        ).trim() || undefined;
      if (name) users[name] = { id, label };
      // Also map a simple, lowercased handle derived from display name when safe
      if (label) {
        const key = label.toLowerCase().replace(/[^a-z0-9._-]+/g, '');
        if (key && !users[key]) users[key] = { id, label };
      }
    }
    const meta = asRecord(data['response_metadata']);
    const next = String(meta['next_cursor'] ?? '').trim();
    if (!next) break;
    cursor = next;
  }
  return users;
}

async function fetchAllSlackChannels(
  token: string
): Promise<SlackSnapshotV1['channels']> {
  const channels: Record<string, { id: string; label?: string }> = {};
  let cursor: string | undefined;
  for (let page = 0; page < 50; page++) {
    const url = new URL('https://slack.com/api/conversations.list');
    url.searchParams.set('limit', '200');
    url.searchParams.set('types', 'public_channel,private_channel');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Slack conversations.list ${res.status}`);
    const raw = (await res.json()) as unknown;
    const data = asRecord(raw);
    if (data['ok'] !== true) {
      const errRec = asRecord(data);
      const errMsg = String(
        (errRec['error'] as string | undefined) ?? 'unknown'
      );
      throw new Error(`Slack conversations.list error: ${errMsg}`);
    }
    const chansRaw = data['channels'];
    const chans = Array.isArray(chansRaw) ? (chansRaw as unknown[]) : [];
    for (const cc of chans) {
      const c = asRecord(cc);
      const id = String(c['id'] ?? '');
      const name = String(c['name'] ?? '').trim();
      if (!id || !name) continue;
      channels[name] = { id, label: `#${name}` };
    }
    const meta = asRecord(data['response_metadata']);
    const next = String(meta['next_cursor'] ?? '').trim();
    if (!next) break;
    cursor = next;
  }
  return channels;
}

// ——— Linear helpers ———
async function fetchLinearDefaults(apiKey: string): Promise<{
  orgSlug?: string;
  teamKeys: string[];
  users: LinearSnapshotV1['users'];
}> {
  const q = `
    query FFDefaults {
      organization { slug }
      teams(first: 250) { nodes { key } }
      users(first: 250) { nodes { id name displayName url } }
    }
  `;
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: q }),
  });
  if (!res.ok) throw new Error(`Linear GraphQL ${res.status}`);
  const raw = (await res.json()) as unknown;
  const body = asRecord(raw);
  const bodyErrors = Array.isArray(body['errors'])
    ? (body['errors'] as unknown[])
    : [];
  if (bodyErrors.length > 0) {
    const first = asRecord(bodyErrors[0]);
    const msg = String(first['message'] ?? 'unknown');
    throw new Error(`Linear GraphQL error: ${msg}`);
  }
  const data = asRecord(body['data']);
  const org = asRecord(data['organization']);
  const orgSlug: string | undefined =
    String(org['slug'] ?? '').trim() || undefined;
  const teamsRec = asRecord(data['teams']);
  const teamNodesRaw = teamsRec['nodes'];
  const teamNodes = Array.isArray(teamNodesRaw)
    ? (teamNodesRaw as unknown[])
    : [];
  const teamKeys: string[] = teamNodes
    .map((n) => String(asRecord(n)['key'] ?? '').trim())
    .filter((k) => k.length > 0);
  const usersRec = asRecord(data['users']);
  const usersNodesRaw = usersRec['nodes'];
  const usersNodes = Array.isArray(usersNodesRaw)
    ? (usersNodesRaw as unknown[])
    : [];
  const users: Record<string, { url: string; label?: string }> = {};
  for (const uu of usersNodes) {
    const u = asRecord(uu);
    const url = String(u['url'] ?? '').trim();
    const name = String(u['name'] ?? '').trim();
    const display = String(u['displayName'] ?? '').trim();
    const label = display || name || undefined;
    if (!url) continue;
    // Key by a lowercased, simple handle derived from name/display; callers can override
    const key1 = (display || name).toLowerCase().replace(/[^a-z0-9._-]+/g, '');
    if (key1) users[key1] = { url, label };
    // Also key by the first token of the name (e.g., "Riley" from "Riley Tomasek")
    const first = (name || display).split(/\s+/)[0]?.toLowerCase();
    if (first && !users[first]) users[first] = { url, label };
  }
  return { orgSlug, teamKeys, users };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}
