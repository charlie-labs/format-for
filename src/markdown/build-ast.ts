import { ensureDefaultsForTarget } from '../runtime/defaults.js';
import { parseToCanonicalMdast } from './parse.js';
import { type FormatOptions, type FormatTarget } from './types.js';

type CanonicalMdast = ReturnType<typeof parseToCanonicalMdast>;

function mergeMapsForTarget(
  target: FormatTarget,
  a?: FormatOptions['maps'],
  b?: FormatOptions['maps']
): NonNullable<FormatOptions['maps']> {
  // Construct the target-scoped map explicitly to avoid assertions.
  const out: NonNullable<FormatOptions['maps']> = {};
  switch (target) {
    case 'slack': {
      if (a?.slack) out.slack = a.slack;
      if (b?.slack) out.slack = b.slack; // caller overrides defaults when provided
      break;
    }
    case 'github':
    case 'linear': {
      if (a?.linear) out.linear = a.linear;
      if (b?.linear) out.linear = b.linear; // caller overrides defaults when provided
      break;
    }
    default: {
      break; // no maps for other targets
    }
  }
  return out;
}

function mergeAutolinks(
  a?: FormatOptions['autolinks'],
  b?: FormatOptions['autolinks']
): NonNullable<FormatOptions['autolinks']> {
  // Start from existing families (currently just `linear`) so we don't drop
  // any provided defaults. Then deep‑merge the Linear family by concatenating
  // and de‑duping.
  const out: NonNullable<FormatOptions['autolinks']> = { ...(a ?? {}) };

  const combined = [...(a?.linear ?? []), ...(b?.linear ?? [])];
  if (combined.length > 0) {
    const seen = new Set<string>();
    const nextLinear: NonNullable<
      NonNullable<FormatOptions['autolinks']>['linear']
    > = [];
    for (const r of combined) {
      const key = `${r.pattern.source}/${r.pattern.flags}|${r.urlTemplate}|${r.labelTemplate ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      nextLinear.push(r);
    }
    out.linear = nextLinear;
  }
  return out;
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
