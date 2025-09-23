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
// Back-off window after a failed attempt to avoid repeated network churn
const ERROR_RETRY_MS = 60_000; // 1m

let current: Snapshot | undefined;
let inflightSlack: Promise<void> | undefined;
let inflightLinear: Promise<void> | undefined;
let lastSlackLoad = 0;
let lastLinearLoad = 0;
let lastSlackAttempt = 0;
let lastLinearAttempt = 0;

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

  const needSlackBase =
    !!slackToken &&
    now - lastSlackLoad > SLACK_TTL_MS &&
    (!hintTarget || wantsSlack);
  const needLinearBase =
    !!linearToken &&
    now - lastLinearLoad > LINEAR_TTL_MS &&
    (!hintTarget || wantsLinear);
  const cooledSlack = now - lastSlackAttempt > ERROR_RETRY_MS;
  const cooledLinear = now - lastLinearAttempt > ERROR_RETRY_MS;
  const needSlack = needSlackBase && cooledSlack;
  const needLinear = needLinearBase && cooledLinear;

  // Slack refresh (independent)
  if (needSlack && !inflightSlack) {
    lastSlackAttempt = Date.now();
    inflightSlack = (async () => {
      try {
        const emptySlack: NonNullable<MentionMaps['slack']> = {
          users: {},
          channels: {},
        };
        const slackVal = slackToken
          ? await loadSlackCatalog(slackToken)
          : emptySlack;
        const usersCount = Object.keys(slackVal.users ?? {}).length;
        const channelsCount = Object.keys(slackVal.channels ?? {}).length;
        if (usersCount + channelsCount > 0) {
          // Merge onto the latest snapshot to avoid clobbering a concurrent Linear refresh
          const existing = current;
          const mergedMaps: MentionMaps = {
            ...(existing?.maps ?? {}),
            slack: slackVal,
          };
          current = {
            maps: mergedMaps,
            autolinks: existing?.autolinks,
            loadedAt: Date.now(),
          };
          lastSlackLoad = Date.now();
        }
      } catch (err) {
        if (safeEnv('FORMAT_FOR_LOG_RUNTIME_ERRORS') === '1') {
          console.warn('[format-for] Slack defaults refresh failed:', err);
        }
      } finally {
        inflightSlack = undefined;
      }
    })();
  }

  // Linear refresh (independent)
  if (needLinear && !inflightLinear) {
    lastLinearAttempt = Date.now();
    inflightLinear = (async () => {
      try {
        const bits = linearToken
          ? await loadLinearIndex(linearToken)
          : ({
              orgSlug: undefined,
              teamKeys: [],
              users: {},
            } satisfies LinearBits);
        const appliedUsers = Object.keys(bits.users).length > 0;
        const rules =
          bits.orgSlug && bits.teamKeys.length > 0
            ? buildLinearAutolinks(bits.orgSlug, bits.teamKeys)
            : [];
        // Merge onto the latest snapshot to avoid clobbering a concurrent Slack refresh
        const existing = current;
        const nextMaps: MentionMaps = { ...(existing?.maps ?? {}) };
        if (appliedUsers) nextMaps.linear = { users: bits.users };
        const nextAutolinks = { ...(existing?.autolinks ?? {}), linear: rules };
        if (appliedUsers || rules.length > 0) {
          current = {
            maps: nextMaps,
            autolinks: nextAutolinks,
            loadedAt: Date.now(),
          };
          lastLinearLoad = Date.now();
        }
      } catch (err) {
        if (safeEnv('FORMAT_FOR_LOG_RUNTIME_ERRORS') === '1') {
          console.warn('[format-for] Linear defaults refresh failed:', err);
        }
      } finally {
        inflightLinear = undefined;
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
      const now = Date.now();
      if (now - lastSlackAttempt > ERROR_RETRY_MS) {
        lastSlackAttempt = now;
        try {
          const slackMaps = await loadSlackCatalog(slackToken);
          const usersCount = Object.keys(slackMaps.users ?? {}).length;
          const channelsCount = Object.keys(slackMaps.channels ?? {}).length;
          const applied = usersCount + channelsCount > 0;
          const prev = current;
          const nextMaps: MentionMaps = applied
            ? { ...(prev?.maps ?? {}), slack: slackMaps }
            : { ...(prev?.maps ?? {}) };
          current = {
            maps: nextMaps,
            autolinks: prev?.autolinks,
            loadedAt: Date.now(),
          };
          if (applied) lastSlackLoad = Date.now();
        } catch (err) {
          if (safeEnv('FORMAT_FOR_LOG_RUNTIME_ERRORS') === '1') {
            console.warn(
              '[format-for] initial Slack defaults load failed:',
              err
            );
          }
        }
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
      const now = Date.now();
      if (now - lastLinearAttempt > ERROR_RETRY_MS) {
        lastLinearAttempt = now;
        try {
          const bits = await loadLinearIndex(linearToken);
          const prev = current;
          const nextMaps: MentionMaps = { ...(prev?.maps ?? {}) };
          const appliedUsers = Object.keys(bits.users).length > 0;
          if (appliedUsers) nextMaps.linear = { users: bits.users };
          const rules =
            bits.orgSlug && bits.teamKeys.length > 0
              ? buildLinearAutolinks(bits.orgSlug, bits.teamKeys)
              : [];
          const nextAutolinks = { ...(prev?.autolinks ?? {}), linear: rules };
          current = {
            maps: nextMaps,
            autolinks: nextAutolinks,
            loadedAt: Date.now(),
          };
          if (appliedUsers || rules.length > 0) lastLinearLoad = Date.now();
        } catch (err) {
          if (safeEnv('FORMAT_FOR_LOG_RUNTIME_ERRORS') === '1') {
            console.warn(
              '[format-for] initial Linear defaults load failed:',
              err
            );
          }
        }
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
  inflightSlack = undefined;
  inflightLinear = undefined;
  lastSlackLoad = 0;
  lastLinearLoad = 0;
  lastSlackAttempt = 0;
  lastLinearAttempt = 0;
}

export async function forceLoadNowForTests(): Promise<void> {
  const slackToken = safeEnv('SLACK_BOT_TOKEN');
  const linearToken = safeEnv('LINEAR_API_KEY');
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
    const [slackMaps, linearBits] = await Promise.allSettled([
      slackToken ? loadSlackCatalog(slackToken) : Promise.resolve(emptySlack),
      linearToken ? loadLinearIndex(linearToken) : Promise.resolve(emptyLinear),
    ] as const);
    const nextMaps: MentionMaps = { ...(current?.maps ?? {}) };
    if (
      slackMaps.status === 'fulfilled' &&
      ((slackMaps.value.users &&
        Object.keys(slackMaps.value.users).length > 0) ||
        (slackMaps.value.channels &&
          Object.keys(slackMaps.value.channels).length > 0))
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
      const appliedUsers = Object.keys(bits.users).length > 0;
      const rulesApplied = (nextAutolinks.linear?.length ?? 0) > 0;
      if (appliedUsers || rulesApplied) lastLinearLoad = Date.now();
    }
    current = {
      maps: nextMaps,
      autolinks: nextAutolinks,
      loadedAt: Date.now(),
    };
  } catch (err) {
    if (safeEnv('FORMAT_FOR_LOG_RUNTIME_ERRORS') === '1') {
      console.warn('[format-for] test force-load failed:', err);
    }
  }
}
