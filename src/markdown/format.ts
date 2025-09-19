import { parseToCanonicalMdast } from './parse.js';
import { renderGithub } from './renderers/github.js';
import { renderLinear } from './renderers/linear.js';
import { renderSlack } from './renderers/slack.js';
import { type FormatFor } from './types.js';

/**
 * Main entry point.
 */
export const formatFor: FormatFor = async (input, target, options = {}) => {
  const ast = parseToCanonicalMdast(input, {
    maps: options.maps ?? {},
    autolinks: options.autolinks ?? {},
  });

  switch (target) {
    case 'github':
      return renderGithub(ast);
    case 'slack':
      return renderSlack(ast);
    case 'linear':
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
    default:
      return renderGithub(ast);
  }
};
