import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import { remarkCanonicalizeMixed } from './plugins/canonicalize.js';
import { type AutoLinkRule, type MentionMaps } from './types.js';

/**
 * Parse mixed Slack/Linear/GFM to a canonical mdast Root.
 * We rely on a post-parse canonicalizer to normalize Slack angle forms,
 * Linear @user links, autolinks, and Linear '+++ Title' collapsibles.
 */
export function parseToCanonicalMdast(
  input: string,
  opts: { maps?: MentionMaps; autolinks?: { linear?: AutoLinkRule[] } } = {}
) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkCanonicalizeMixed, {
      maps: opts.maps ?? {},
      autolinks: opts.autolinks?.linear ?? [],
    });

  const ast = processor.parse(String(input));
  // Apply transforms synchronously to produce the canonical tree
  return processor.runSync(ast as never) as unknown;
}
