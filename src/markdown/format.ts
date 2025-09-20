import { ensureRuntimeDefaults } from '../runtime/defaults.js';
import { parseToCanonicalMdast } from './parse.js';
import { renderGithub } from './renderers/github.js';
import { renderLinear } from './renderers/linear.js';
import { renderSlack } from './renderers/slack.js';
import {
  type AutoLinkRule,
  DEFAULT_LINEAR_HTML_ALLOW,
  type FormatFor,
  type FormatOptions,
  type FormatTarget,
} from './types.js';

type CanonicalMdast = ReturnType<typeof parseToCanonicalMdast>;

function buildAst(
  input: string,
  target: FormatTarget,
  options: FormatOptions | undefined
): CanonicalMdast {
  // Merge runtime defaults (from env) with per-call options. Keep this logic
  // here so the canonicalizer remains synchronous and simple.
  const defaults = getDefaultsForTarget(target);
  const mergedMaps = {
    ...(defaults.maps ?? {}),
    ...(options?.maps ?? {}),
  } as NonNullable<FormatOptions['maps']>;
  // Narrow maps to the target to avoid cross-target surprises (e.g., Slack
  // user maps turning '@user' into a mention when rendering GitHub/Linear).
  const targetMaps: NonNullable<FormatOptions['maps']> = {};
  if (target === 'slack' && mergedMaps.slack) {
    targetMaps.slack = mergedMaps.slack;
  }
  if ((target === 'github' || target === 'linear') && mergedMaps.linear) {
    targetMaps.linear = mergedMaps.linear;
  }

  const mergedAutolinks: NonNullable<FormatOptions['autolinks']> = {
    linear: [
      ...(defaults.autolinks?.linear ?? []),
      ...(options?.autolinks?.linear ?? []),
    ],
  };

  return parseToCanonicalMdast(input, {
    maps: targetMaps,
    autolinks: mergedAutolinks,
  });
}

// Runtime defaults are loaded lazily at module import. We keep a tiny wrapper so
// tests can stub/replace this during verification.
let runtimeDefaultsCache:
  | ({
      maps?: FormatOptions['maps'];
      autolinks?: FormatOptions['autolinks'];
    } & {
      loaded: boolean;
    })
  | undefined;

function getDefaultsForTarget(_target: FormatTarget): {
  maps?: FormatOptions['maps'];
  autolinks?: FormatOptions['autolinks'];
} {
  if (!runtimeDefaultsCache?.loaded) {
    // Synchronously read the most recently loaded defaults snapshot produced by
    // ensureRuntimeDefaults(). This avoids making buildAst async.
    runtimeDefaultsCache = { ...ensureRuntimeDefaults(), loaded: true };
  }
  return runtimeDefaultsCache ?? {};
}

export const formatFor: FormatFor = {
  async github(input: string, options: FormatOptions = {}): Promise<string> {
    // Kick off background load on first call. Non-blocking for simplicity; the
    // loader is fast and cached. The synchronous snapshot is read in buildAst.
    void ensureRuntimeDefaults();
    const ast = buildAst(input, 'github', options);
    return renderGithub(ast);
  },
  async slack(input: string, options: FormatOptions = {}): Promise<string> {
    void ensureRuntimeDefaults();
    const ast = buildAst(input, 'slack', options);
    return renderSlack(ast);
  },
  async linear(input: string, options: FormatOptions = {}): Promise<string> {
    void ensureRuntimeDefaults();
    const ast = buildAst(input, 'linear', options);
    return renderLinear(ast, {
      // Use a cloned copy to guarantee immutability across calls even if a future
      // refactor accidentally mutates the array downstream.
      allowHtml: [...DEFAULT_LINEAR_HTML_ALLOW],
    });
  },
};
