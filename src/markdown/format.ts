import { parseToCanonicalMdast } from './parse.js';
import { renderGithub } from './renderers/github.js';
import { renderLinear } from './renderers/linear.js';
import { renderSlack } from './renderers/slack.js';
import { type FormatFor } from './types.js';

/**
 * Main entry point: format a mixed Slack/Linear/GFM string for a target platform.
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
        autolinks: options.autolinks?.linear ?? [],
        maps: options.maps?.linear ?? { users: {} },
      });
    default:
      return renderGithub(ast);
  }
};
