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
    return renderGithub(ast);
  },
  async slack(input: string, options: FormatOptions = {}): Promise<string> {
    const ast = await buildAstForSlack(input, options);
    return renderSlack(ast);
  },
  async linear(input: string, options: FormatOptions = {}): Promise<string> {
    const ast = await buildAstForLinear(input, options);
    return renderLinear(ast, {
      // Use a cloned copy to guarantee immutability across calls even if a future
      // refactor accidentally mutates the array downstream.
      allowHtml: [...DEFAULT_LINEAR_HTML_ALLOW],
    });
  },
};
