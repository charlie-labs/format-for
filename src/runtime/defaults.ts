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
import {
  type AutoLinkRule,
  type FormatTarget,
  type MentionMaps,
} from '../markdown/types.js';
import {
  buildLinearAutolinks,
  type LinearBits,
  loadLinearIndex,
} from './linear.js';
import { loadSlackCatalog } from './slack.js';

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

/**
 * Ensure runtime defaults are warmed in the background based on TTLs.
 * Returns the latest synchronous snapshot. If `hintTarget` is provided, only
 * the relevant sources for that target will be refreshed in the background.
 */
export function ensureRuntimeDefaults(hintTarget?: FormatTarget): {
  maps?: MentionMaps;
  autolinks?: { linear?: AutoLinkRule[] };
} {
  const now = Date.now();
  const slackToken = safeEnv('SLACK_BOT_TOKEN');
  const linearToken = safeEnv('LINEAR_API_KEY');

  // Only refresh sources relevant to the hinted target
  const wantsSlack = hintTarget === 'slack';
  const wantsLinear = hintTarget === 'github' || hintTarget === 'linear';

  const needSlack =
    !!slackToken &&
    now - lastSlackLoad > SLACK_TTL_MS &&
    (!hintTarget || wantsSlack);
  const needLinear =
    !!linearToken &&
    now - lastLinearLoad > LINEAR_TTL_MS &&
    (!hintTarget || wantsLinear);

  if ((needSlack || needLinear) && !inflight) {
    inflight = (async () => {
      try {
        const emptySlack: NonNullable<MentionMaps['slack']> = {
          users: {},
          channels: {},
        };
        const emptyLinear: LinearBits = {
          orgSlug: undefined,
          teamKeys: [],
          users: {},
        };
        const promises: [
          Promise<NonNullable<MentionMaps['slack']>>,
          Promise<LinearBits>,
        ] = [
          needSlack && slackToken
            ? loadSlackCatalog(slackToken)
            : Promise.resolve(emptySlack),
          needLinear && linearToken
            ? loadLinearIndex(linearToken)
            : Promise.resolve(emptyLinear),
        ];
        const [slackRes, linearRes] = await Promise.allSettled(promises);

        const nextMaps: MentionMaps = { ...(current?.maps ?? {}) };
        if (needSlack && slackRes.status === 'fulfilled') {
          const slackVal = slackRes.value ?? emptySlack;
          const usersCount = Object.keys(slackVal.users ?? {}).length;
          const channelsCount = Object.keys(slackVal.channels ?? {}).length;
          if (usersCount + channelsCount > 0) {
            nextMaps.slack = slackVal;
          }
          lastSlackLoad = Date.now();
        } else if (slackRes.status === 'rejected') {
          console.warn(
            '[format-for] Slack defaults refresh failed:',
            slackRes.reason
          );
        }

        let nextAutolinks = current?.autolinks ?? {};
        if (needLinear && linearRes.status === 'fulfilled') {
          const bits = linearRes.value;
          if (Object.keys(bits.users).length > 0) {
            nextMaps.linear = { users: bits.users };
          }
          const rules =
            bits.orgSlug && bits.teamKeys.length > 0
              ? buildLinearAutolinks(bits.orgSlug, bits.teamKeys)
              : [];
          // Replace only the Linear rules; preserve other families if added later
          nextAutolinks = { ...nextAutolinks, linear: rules };
          lastLinearLoad = Date.now();
        } else if (linearRes.status === 'rejected') {
          console.warn(
            '[format-for] Linear defaults refresh failed:',
            linearRes.reason
          );
        }

        current = {
          maps: nextMaps,
          autolinks: nextAutolinks,
          loadedAt: Date.now(),
        };
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

/**
 * Ensure the data needed for the given target exists, blocking on the first
 * use so initial renders benefit from maps/autolinks. Subsequent refreshes
 * remain background-only.
 */
export async function ensureDefaultsForTarget(
  target: FormatTarget
): Promise<{ maps?: MentionMaps; autolinks?: { linear?: AutoLinkRule[] } }> {
  const slackUsersCount = Object.keys(current?.maps?.slack?.users ?? {}).length;
  const slackChannelsCount = Object.keys(
    current?.maps?.slack?.channels ?? {}
  ).length;
  const hasSlack = slackUsersCount + slackChannelsCount > 0;
  const hasLinearUsers =
    !!current?.maps?.linear?.users &&
    Object.keys(current?.maps?.linear?.users ?? {}).length > 0;
  const hasLinearAutolinks =
    !!current?.autolinks?.linear &&
    (current?.autolinks?.linear?.length ?? 0) > 0;
  const slackToken = safeEnv('SLACK_BOT_TOKEN');
  const linearToken = safeEnv('LINEAR_API_KEY');

  if (target === 'slack') {
    if (!hasSlack && slackToken) {
      // Block to load Slack once for first use
      try {
        const slackMaps = await loadSlackCatalog(slackToken);
        current = {
          maps: { ...(current?.maps ?? {}), slack: slackMaps },
          autolinks: current?.autolinks,
          loadedAt: Date.now(),
        };
        lastSlackLoad = Date.now();
      } catch (err) {
        console.warn('[format-for] initial Slack defaults load failed:', err);
      }
    } else {
      // Kick a background refresh if TTL expired
      ensureRuntimeDefaults('slack');
    }
  } else {
    // github or linear → need Linear users + autolinks
    const needsBlock =
      (!hasLinearUsers || !hasLinearAutolinks) && !!linearToken;
    if (needsBlock && linearToken) {
      try {
        const bits = await loadLinearIndex(linearToken);
        const nextMaps: MentionMaps = { ...(current?.maps ?? {}) };
        if (Object.keys(bits.users).length > 0) {
          nextMaps.linear = { users: bits.users };
        }
        const nextAutolinks = {
          ...(current?.autolinks ?? {}),
          linear:
            bits.orgSlug && bits.teamKeys.length > 0
              ? buildLinearAutolinks(bits.orgSlug, bits.teamKeys)
              : [],
        };
        current = {
          maps: nextMaps,
          autolinks: nextAutolinks,
          loadedAt: Date.now(),
        };
        lastLinearLoad = Date.now();
      } catch (err) {
        console.warn('[format-for] initial Linear defaults load failed:', err);
      }
    } else {
      ensureRuntimeDefaults(target);
    }
  }
  return { maps: current?.maps, autolinks: current?.autolinks };
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
    const [slackMaps, linearBits] = await Promise.allSettled([
      slackToken ? loadSlackCatalog(slackToken) : Promise.resolve({}),
      linearToken
        ? loadLinearIndex(linearToken)
        : Promise.resolve({ orgSlug: undefined, teamKeys: [], users: {} }),
    ] as const);
    const nextMaps: MentionMaps = { ...(current?.maps ?? {}) };
    if (
      slackMaps.status === 'fulfilled' &&
      Object.keys(slackMaps.value).length > 0
    ) {
      nextMaps.slack = slackMaps.value;
      lastSlackLoad = Date.now();
    }
    let nextAutolinks = current?.autolinks ?? {};
    if (linearBits.status === 'fulfilled') {
      const bits = linearBits.value;
      if (Object.keys(bits.users).length > 0) {
        nextMaps.linear = { users: bits.users };
      }
      nextAutolinks = {
        ...nextAutolinks,
        linear:
          bits.orgSlug && bits.teamKeys.length > 0
            ? buildLinearAutolinks(bits.orgSlug, bits.teamKeys)
            : [],
      };
      lastLinearLoad = Date.now();
    }
    current = {
      maps: nextMaps,
      autolinks: nextAutolinks,
      loadedAt: Date.now(),
    };
  } catch (err) {
    console.warn('[format-for] test force-load failed:', err);
  }
}
