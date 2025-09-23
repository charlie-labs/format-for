import { parseToCanonicalMdast } from './parse.js';
import { renderGithub } from './renderers/github.js';
import { renderLinear } from './renderers/linear.js';
import { renderSlack } from './renderers/slack.js';
import {
  type AutoLinkRule,
  DEFAULT_LINEAR_HTML_ALLOW,
  type FormatFor,
  type FormatOptions,
} from './types.js';

type CanonicalMdast = ReturnType<typeof parseToCanonicalMdast>;

function buildAst(
  input: string,
  options: FormatOptions | undefined
): CanonicalMdast {
  const raw = [
    ...(options?.autolinks?.github ?? []),
    ...(options?.autolinks?.slack ?? []),
    ...(options?.autolinks?.linear ?? []),
  ];
  // Cross-target dedupe and normalization (ensure global + canonical flags)
  const byPattern = new Map<string, AutoLinkRule>();
  for (const r of raw) {
    const base = r.pattern;
    const norm = base.global ? base : new RegExp(base.source, base.flags + 'g');
    const key = `${norm.source}|${norm.flags}`;
    if (!byPattern.has(key)) {
      byPattern.set(key, norm === base ? r : { ...r, pattern: norm });
    }
  }
  const autos = [...byPattern.values()];
  return parseToCanonicalMdast(input, {
    maps: options?.maps ?? {},
    autolinks: autos,
  });
}

export const formatFor: FormatFor = {
  async github(input: string, options: FormatOptions = {}): Promise<string> {
    const ast = buildAst(input, options);
    return renderGithub(ast, options);
  },
  async slack(input: string, options: FormatOptions = {}): Promise<string> {
    const ast = buildAst(input, options);
    return renderSlack(ast, options);
  },
  async linear(input: string, options: FormatOptions = {}): Promise<string> {
    const ast = buildAst(input, options);
    return renderLinear(ast, {
      // Do not allow overriding allowHtml.
      allowHtml: [...DEFAULT_LINEAR_HTML_ALLOW],
      warnings: options.warnings,
    });
  },
};
