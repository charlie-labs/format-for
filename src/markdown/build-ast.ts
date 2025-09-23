import { parseToCanonicalMdast } from './parse.js';
import { type FormatOptions, type FormatTarget } from './types.js';
import {
  flattenAutolinks,
  normalizeAndDedupeAutolinks,
} from './utils/autolinks.js';

export type CanonicalMdast = ReturnType<typeof parseToCanonicalMdast>;

export function buildAst(
  input: string,
  options: FormatOptions | undefined,
  target: FormatTarget
): CanonicalMdast {
  const raw = flattenAutolinks(options, target);
  const autos = normalizeAndDedupeAutolinks(raw);
  return parseToCanonicalMdast(input, {
    maps: options?.maps ?? {},
    autolinks: autos,
    target,
  });
}
