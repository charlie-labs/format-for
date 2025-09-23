import { buildAst } from './build-ast.js';
import { renderGithub } from './renderers/github.js';
import { renderLinear } from './renderers/linear.js';
import { renderSlack } from './renderers/slack.js';
import {
  DEFAULT_LINEAR_HTML_ALLOW,
  type FormatFor,
  type FormatOptions,
} from './types.js';

// buildAst shared in ./build-ast

export const formatFor: FormatFor = {
  async github(input: string, options: FormatOptions = {}): Promise<string> {
    const ast = buildAst(input, options, 'github');
    return renderGithub(ast, options);
  },
  async slack(input: string, options: FormatOptions = {}): Promise<string> {
    const ast = buildAst(input, options, 'slack');
    return renderSlack(ast, options);
  },
  async linear(input: string, options: FormatOptions = {}): Promise<string> {
    const ast = buildAst(input, options, 'linear');
    return renderLinear(ast, {
      // Do not allow overriding allowHtml.
      allowHtml: [...DEFAULT_LINEAR_HTML_ALLOW],
      warnings: options.warnings,
    });
  },
};
