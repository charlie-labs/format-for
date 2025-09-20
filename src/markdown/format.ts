import { parseToCanonicalMdast } from './parse.js';
import { renderGithub } from './renderers/github.js';
import { renderLinear } from './renderers/linear.js';
import { renderSlack } from './renderers/slack.js';
import { type FormatFor, type FormatOptions } from './types.js';

function buildAst(input: string, options: FormatOptions | undefined) {
  return parseToCanonicalMdast(input, {
    maps: options?.maps ?? {},
    autolinks: options?.autolinks ?? {},
  });
}

export const formatFor: FormatFor = {
  async github(input, options = {}) {
    const ast = buildAst(input, options);
    return renderGithub(ast);
  },
  async slack(input, options = {}) {
    const ast = buildAst(input, options);
    return renderSlack(ast);
  },
  async linear(input, options = {}) {
    const ast = buildAst(input, options);
    return renderLinear(ast, {
      allowHtml: options.linearHtmlAllow ?? [
        'details',
        'summary',
        'u',
        'sub',
        'sup',
        'br',
      ],
    });
  },
};
