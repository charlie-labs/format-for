import {
  buildAstForGithub,
  buildAstForLinear,
  buildAstForSlack,
} from './build-ast.js';
import { renderGithub } from './renderers/github.js';
import { renderLinear } from './renderers/linear.js';
import { renderSlack } from './renderers/slack.js';
import {
  DEFAULT_LINEAR_HTML_ALLOW,
  type FormatFor,
  type FormatOptions,
} from './types.js';

export const formatFor: FormatFor = {
  async github(input: string, options: FormatOptions = {}): Promise<string> {
    const ast = await buildAstForGithub(input, options);
    return renderGithub(ast, options);
  },
  async slack(input: string, options: FormatOptions = {}): Promise<string> {
    const ast = await buildAstForSlack(input, options);
    return renderSlack(ast, options);
  },
  async linear(input: string, options: FormatOptions = {}): Promise<string> {
    const ast = await buildAstForLinear(input, options);
    return renderLinear(ast, {
      // Do not allow overriding allowHtml.
      allowHtml: [...DEFAULT_LINEAR_HTML_ALLOW],
      warnings: options.warnings,
    });
  },
};
