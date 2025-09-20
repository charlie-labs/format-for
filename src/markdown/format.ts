import { parseToCanonicalMdast } from './parse.js';
import { renderGithub } from './renderers/github.js';
import { renderLinear } from './renderers/linear.js';
import { renderSlack } from './renderers/slack.js';
import { type FormatFor, type FormatOptions } from './types.js';

// Default Linear HTML allowlist used when `options.linearHtmlAllow` is not provided.
// Cloned at call sites to avoid accidental mutation.
const DEFAULT_LINEAR_HTML_ALLOW = [
  'details',
  'summary',
  'u',
  'sub',
  'sup',
  'br',
] as const;

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

export const formatFor: FormatFor = {
  async github(input: string, options: FormatOptions = {}): Promise<string> {
    const ast = buildAst(input, options);
    return renderGithub(ast);
  },
  async slack(input: string, options: FormatOptions = {}): Promise<string> {
    const ast = buildAst(input, options);
    return renderSlack(ast);
  },
  async linear(input: string, options: FormatOptions = {}): Promise<string> {
    const ast = buildAst(input, options);
    return renderLinear(ast, {
      allowHtml: [...(options.linearHtmlAllow ?? DEFAULT_LINEAR_HTML_ALLOW)],
    });
  },
};
