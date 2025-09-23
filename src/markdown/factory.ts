import { parseToCanonicalMdast } from './parse.js';
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

type CanonicalMdast = ReturnType<typeof parseToCanonicalMdast>;

function buildAst(
  input: string,
  options: FormatOptions | undefined
): CanonicalMdast {
  return parseToCanonicalMdast(input, {
    maps: options?.maps ?? {},
    autolinks: options?.autolinks ?? {},
  });
}

function concatDedupeAutolinks(
  a: AutoLinkRule[] | undefined,
  b: AutoLinkRule[] | undefined
): AutoLinkRule[] {
  const out: AutoLinkRule[] = [];
  const seen = new Set<string>();
  const push = (r?: AutoLinkRule) => {
    if (!r) return;
    const flags = r.pattern.flags.includes('g')
      ? r.pattern.flags
      : r.pattern.flags + 'g';
    const key = `${r.pattern.source}|${flags}|${r.urlTemplate}|${
      r.labelTemplate ?? ''
    }`;
    if (seen.has(key)) return;
    seen.add(key);
    // Normalize flags to include 'g' to avoid runtime surprises in callers
    if (!r.pattern.flags.includes('g')) {
      out.push({ ...r, pattern: new RegExp(r.pattern.source, flags) });
    } else {
      out.push(r);
    }
  };
  for (const r of a ?? []) push(r);
  for (const r of b ?? []) push(r);
  return out;
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
  defaults: { maps?: MentionMaps; autolinks?: { linear?: AutoLinkRule[] } },
  options: FormatOptions | undefined
): FormatOptions {
  const maps = mergeMentionMaps(defaults.maps, options?.maps);
  const linearAuto = concatDedupeAutolinks(
    defaults.autolinks?.linear,
    options?.autolinks?.linear
  );
  const autolinks = linearAuto.length > 0 ? { linear: linearAuto } : {};
  return { maps, autolinks } satisfies FormatOptions;
}

async function ensureAndBuild(
  input: string,
  target: FormatTarget,
  provider: DefaultsProvider | undefined,
  options: FormatOptions | undefined
): Promise<CanonicalMdast> {
  let effective: FormatOptions | undefined = options;
  if (provider) {
    await provider.ensureFor(target);
    effective = mergeWithDefaults(provider.snapshot(), options);
  }
  return buildAst(input, effective);
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
      const ast = await ensureAndBuild(input, 'github', provider, options);
      return renderGithub(ast);
    },
    async slack(input: string, options: FormatOptions = {}): Promise<string> {
      const ast = await ensureAndBuild(input, 'slack', provider, options);
      return renderSlack(ast);
    },
    async linear(input: string, options: FormatOptions = {}): Promise<string> {
      const ast = await ensureAndBuild(input, 'linear', provider, options);
      return renderLinear(ast, { allowHtml: [...DEFAULT_LINEAR_HTML_ALLOW] });
    },
  } satisfies FormatFor;

  return api;
}
