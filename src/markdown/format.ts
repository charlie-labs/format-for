import { parseToCanonicalMdast } from './parse.js';
import { renderGithub } from './renderers/github.js';
import { renderLinear } from './renderers/linear.js';
import { renderSlack } from './renderers/slack.js';
import {
  DEFAULT_LINEAR_HTML_ALLOW,
  type FormatFor,
  type FormatOptions,
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
      // Caller options first (warnings/target knobs); do not allow overriding allowHtml.
      ...options,
      // Use a cloned copy to guarantee immutability across calls even if a future
      // refactor accidentally mutates the array downstream.
      allowHtml: [...DEFAULT_LINEAR_HTML_ALLOW],
    });
  },
};
