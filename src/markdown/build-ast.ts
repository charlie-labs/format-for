import { ensureDefaultsForTarget } from '../runtime/defaults.js';
import { parseToCanonicalMdast } from './parse.js';
import { type FormatOptions, type FormatTarget } from './types.js';

type CanonicalMdast = ReturnType<typeof parseToCanonicalMdast>;

function mergeMapsForTarget(
  target: FormatTarget,
  a?: FormatOptions['maps'],
  b?: FormatOptions['maps']
): NonNullable<FormatOptions['maps']> {
  const merged = { ...(a ?? {}), ...(b ?? {}) } as NonNullable<
    FormatOptions['maps']
  >;
  const out: NonNullable<FormatOptions['maps']> = {};
  if (target === 'slack' && merged.slack) out.slack = merged.slack;
  if ((target === 'github' || target === 'linear') && merged.linear) {
    out.linear = merged.linear;
  }
  return out;
}

function mergeAutolinks(
  a?: FormatOptions['autolinks'],
  b?: FormatOptions['autolinks']
): NonNullable<FormatOptions['autolinks']> {
  return { ...(a ?? {}), ...(b ?? {}) } as NonNullable<
    FormatOptions['autolinks']
  >;
}

async function buildFor(
  target: FormatTarget,
  input: string,
  options?: FormatOptions
): Promise<CanonicalMdast> {
  const defaults = await ensureDefaultsForTarget(target);
  const maps = mergeMapsForTarget(target, defaults.maps, options?.maps);
  const autolinks = mergeAutolinks(defaults.autolinks, options?.autolinks);
  return parseToCanonicalMdast(input, { target, maps, autolinks });
}

export async function buildAstForGithub(
  input: string,
  options?: FormatOptions
): Promise<CanonicalMdast> {
  return buildFor('github', input, options);
}

export async function buildAstForSlack(
  input: string,
  options?: FormatOptions
): Promise<CanonicalMdast> {
  return buildFor('slack', input, options);
}

export async function buildAstForLinear(
  input: string,
  options?: FormatOptions
): Promise<CanonicalMdast> {
  return buildFor('linear', input, options);
}
