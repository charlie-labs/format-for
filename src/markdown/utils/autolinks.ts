import {
  type AutoLinkRule,
  type FormatOptions,
  type FormatTarget,
} from '../types.js';

/**
 * Normalize autolink rules to ensure patterns are global (adds 'g' when missing)
 * and dedupe by (source|flags) with canonical flag ordering.
 */
export function normalizeAndDedupeAutolinks(
  rules: AutoLinkRule[]
): AutoLinkRule[] {
  const byPattern = new Map<string, AutoLinkRule>();
  for (const r of rules) {
    const base = r.pattern;
    const norm = base.global ? base : new RegExp(base.source, base.flags + 'g');
    const key = `${norm.source}|${norm.flags}`;
    if (!byPattern.has(key)) {
      byPattern.set(key, norm === base ? r : { ...r, pattern: norm });
    }
  }
  return [...byPattern.values()];
}

/**
 * Flatten per-target autolinks to a single list, preferring the current target's
 * rules for precedence (placed first), then the others in a stable order.
 */
export function flattenAutolinks(
  options: FormatOptions | undefined,
  target: FormatTarget
): AutoLinkRule[] {
  const prefer = options?.autolinks?.[target] ?? [];
  const others: AutoLinkRule[] = [];
  if (target !== 'github') others.push(...(options?.autolinks?.github ?? []));
  if (target !== 'slack') others.push(...(options?.autolinks?.slack ?? []));
  if (target !== 'linear') others.push(...(options?.autolinks?.linear ?? []));
  return [...prefer, ...others];
}
