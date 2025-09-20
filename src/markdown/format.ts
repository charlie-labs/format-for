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
    return renderGithub(ast);
  },
  async slack(input: string, options: FormatOptions = {}): Promise<string> {
    const ast = buildAst(input, options);
    return renderSlack(ast);
  },
  async linear(input: string, options: FormatOptions = {}): Promise<string> {
    // Back-compat: if older callers pass a removed option, emit a warning and ignore it.
    if (options && 'linearHtmlAllow' in (options as Record<string, unknown>)) {
      // eslint-disable-next-line no-console
      console.warn(
        'formatFor.linear: options.linearHtmlAllow has been removed and will be ignored; Linear HTML allowlist is fixed.'
      );
    }
    const ast = buildAst(input, options);
    return renderLinear(ast, {
      // Use a cloned copy to guarantee immutability across calls even if a future
      // refactor accidentally mutates the array downstream.
      allowHtml: [...DEFAULT_LINEAR_HTML_ALLOW],
    });
  },
};
