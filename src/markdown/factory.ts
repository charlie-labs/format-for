import { buildAst, type CanonicalMdast } from './build-ast.js';
import { renderGithub } from './renderers/github.js';
import { renderLinear } from './renderers/linear.js';
import { renderSlack } from './renderers/slack.js';
import {
  type AutoLinkRule,
  DEFAULT_LINEAR_HTML_ALLOW,
  type DefaultsProvider,
  type FormatFor,
  type FormatOptions,
  type FormatTarget,
  type MentionMaps,
} from './types.js';
// (no extra utils needed here)

// buildAst shared in ./build-ast

function concatDedupeAutolinks(
  a: AutoLinkRule[] | undefined,
  b: AutoLinkRule[] | undefined
): AutoLinkRule[] {
  // Dedup by normalized pattern (source + canonical flags) and prefer `b` (caller)
  // over `a` (provider) when patterns collide. We also normalize patterns to
  // include the 'g' flag and use canonical flag order for stable keys.
  const byPattern = new Map<string, AutoLinkRule>();
  const normalize = (r: AutoLinkRule): AutoLinkRule => {
    const base = r.pattern;
    const norm = base.global ? base : new RegExp(base.source, base.flags + 'g');
    return norm === base ? r : { ...r, pattern: norm };
  };

  for (const r of a ?? []) {
    const n = normalize(r);
    const key = `${n.pattern.source}|${n.pattern.flags}`;
    if (!byPattern.has(key)) byPattern.set(key, n);
  }
  for (const r of b ?? []) {
    const n = normalize(r);
    const key = `${n.pattern.source}|${n.pattern.flags}`;
    byPattern.set(key, n);
  }
  return [...byPattern.values()];
}

function mergeMentionMaps(a?: MentionMaps, b?: MentionMaps): MentionMaps {
  // Caller (b) overrides provider (a)
  const slackUsers = {
    ...(a?.slack?.users ?? {}),
    ...(b?.slack?.users ?? {}),
  };
  const slackChannels = {
    ...(a?.slack?.channels ?? {}),
    ...(b?.slack?.channels ?? {}),
  };
  const linearUsers = {
    ...(a?.linear?.users ?? {}),
    ...(b?.linear?.users ?? {}),
  };
  const out: MentionMaps = {};
  if (
    Object.keys(slackUsers).length > 0 ||
    Object.keys(slackChannels).length > 0
  ) {
    out.slack = {};
    if (Object.keys(slackUsers).length > 0) out.slack.users = slackUsers;
    if (Object.keys(slackChannels).length > 0) {
      out.slack.channels = slackChannels;
    }
  }
  if (Object.keys(linearUsers).length > 0) {
    out.linear = { users: linearUsers };
  }
  return out;
}

function mergeWithDefaults(
  defaults: {
    maps?: MentionMaps;
    autolinks?: Partial<Record<FormatTarget, AutoLinkRule[]>>;
  },
  options: FormatOptions | undefined
): FormatOptions {
  const maps = mergeMentionMaps(defaults.maps, options?.maps);
  const autolinks: Partial<Record<FormatTarget, AutoLinkRule[]>> = {};
  for (const k of ['github', 'slack', 'linear'] as const) {
    const merged = concatDedupeAutolinks(
      defaults.autolinks?.[k],
      options?.autolinks?.[k]
    );
    if (merged.length > 0) autolinks[k] = merged;
  }
  return { maps, autolinks } satisfies FormatOptions;
}

async function ensureAndBuild(
  input: string,
  target: FormatTarget,
  provider: DefaultsProvider | undefined,
  options: FormatOptions | undefined
): Promise<{ ast: CanonicalMdast; effective: FormatOptions }> {
  let effective: FormatOptions = options ?? {};
  if (provider) {
    await provider.ensureFor(target);
    effective = mergeWithDefaults(provider.snapshot(), options);
  }
  const ast = buildAst(input, effective, target);
  return { ast, effective };
}

export function createFormatFor(
  opts: {
    /** Inject a DefaultsProvider to enable env/network-backed defaults; set `false` to force purity. */
    defaults?: DefaultsProvider | false;
  } = {}
): FormatFor {
  const provider = opts.defaults === false ? undefined : opts.defaults;

  const api: FormatFor = {
    async github(input: string, options: FormatOptions = {}): Promise<string> {
      const { ast, effective } = await ensureAndBuild(
        input,
        'github',
        provider,
        options
      );
      return renderGithub(ast, effective);
    },
    async slack(input: string, options: FormatOptions = {}): Promise<string> {
      const { ast, effective } = await ensureAndBuild(
        input,
        'slack',
        provider,
        options
      );
      return renderSlack(ast, effective);
    },
    async linear(input: string, options: FormatOptions = {}): Promise<string> {
      const { ast, effective } = await ensureAndBuild(
        input,
        'linear',
        provider,
        options
      );
      return renderLinear(ast, {
        allowHtml: [...DEFAULT_LINEAR_HTML_ALLOW],
        warnings: effective.warnings,
      });
    },
  } satisfies FormatFor;

  return api;
}
