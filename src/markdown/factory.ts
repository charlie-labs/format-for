import { formatFor as base } from './format.js';
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

export function createFormatFor(opts?: {
  defaults?: DefaultsProvider | false;
}): FormatFor {
  const provider = opts && opts.defaults ? opts.defaults : undefined;

  if (!provider) return base; // Pure behavior (no implicit defaults)

  return {
    async github(input: string, options: FormatOptions = {}): Promise<string> {
      const eff = await mergeEffective('github', provider, options);
      const ast = parseToCanonicalMdast(input, {
        maps: eff.maps ?? {},
        autolinks: eff.autolinks ?? {},
      });
      return renderGithub(ast, eff);
    },
    async slack(input: string, options: FormatOptions = {}): Promise<string> {
      const eff = await mergeEffective('slack', provider, options);
      const ast = parseToCanonicalMdast(input, {
        maps: eff.maps ?? {},
        autolinks: eff.autolinks ?? {},
      });
      return renderSlack(ast, eff);
    },
    async linear(input: string, options: FormatOptions = {}): Promise<string> {
      const eff = await mergeEffective('linear', provider, options);
      const ast = parseToCanonicalMdast(input, {
        maps: eff.maps ?? {},
        autolinks: eff.autolinks ?? {},
      });
      return renderLinear(ast, {
        // Do not allow overriding allowHtml; pass only supported knobs to renderer.
        allowHtml: [...DEFAULT_LINEAR_HTML_ALLOW],
        warnings: eff.warnings,
      });
    },
  } satisfies FormatFor;
}

async function mergeEffective(
  target: FormatTarget,
  provider: DefaultsProvider,
  options: FormatOptions
): Promise<FormatOptions> {
  await provider.ensureFor(target);
  const snap = provider.snapshot() ?? {};

  const maps = mergeMaps(snap.maps, options.maps);
  const autolinks = mergeAutolinks(snap.autolinks, options.autolinks);

  // Preserve all caller-provided knobs; override with merged maps/autolinks so
  // future `FormatOptions` fields flow through without factory changes.
  const merged: FormatOptions = {
    ...options,
    maps,
    autolinks,
  };
  return merged;
}

function mergeMaps(a?: MentionMaps, b?: MentionMaps): MentionMaps | undefined {
  if (!a && !b) return undefined;
  return {
    slack: {
      ...(a?.slack ?? {}),
      ...(b?.slack ?? {}),
      users: { ...(a?.slack?.users ?? {}), ...(b?.slack?.users ?? {}) },
      channels: {
        ...(a?.slack?.channels ?? {}),
        ...(b?.slack?.channels ?? {}),
      },
    },
    linear: {
      ...(a?.linear ?? {}),
      ...(b?.linear ?? {}),
      users: { ...(a?.linear?.users ?? {}), ...(b?.linear?.users ?? {}) },
    },
  } satisfies MentionMaps;
}

function mergeAutolinks(
  a?: { linear?: AutoLinkRule[] },
  b?: { linear?: AutoLinkRule[] }
): { linear?: AutoLinkRule[] } | undefined {
  const pa = a?.linear ?? [];
  const pb = b?.linear ?? [];
  if (pa.length === 0 && pb.length === 0) return undefined;
  const out: AutoLinkRule[] = [];
  const seen = new Set<string>();
  const push = (r: AutoLinkRule) => {
    const key = `${r.pattern.source}|${r.pattern.flags}|${r.urlTemplate}|${
      r.labelTemplate ?? ''
    }`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  };
  // Give per-call rules precedence on duplicates to mirror maps merge semantics.
  for (const r of pb) push(r); // caller rules first
  for (const r of pa) push(r); // then provider rules
  return { linear: out };
}
