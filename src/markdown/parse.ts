import { type Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import { remarkCanonicalizeMixed } from './plugins/canonicalize.js';
import {
  assertIsRoot,
  type AutoLinkRule,
  type FormatTarget,
  type MentionMaps,
} from './types.js';

/**
 * Parse mixed Slack/Linear/GFM to a canonical mdast Root.
 * We rely on a post-parse canonicalizer to normalize Slack angle forms,
 * Linear @user links, autolinks, and Linear '+++ Title' collapsibles.
 */
export function parseToCanonicalMdast(
  input: string,
  opts: {
    target?: FormatTarget;
    maps?: MentionMaps;
    autolinks?: { linear?: AutoLinkRule[] };
  } = {}
): Root {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkCanonicalizeMixed, {
      target: opts.target,
      maps: opts.maps ?? {},
      autolinks: opts.autolinks?.linear ?? [],
    });

  const ast = processor.parse(String(input));
  // Apply transforms synchronously to produce the canonical tree
  const out = processor.runSync(ast);
  assertIsRoot(out);
  return out;
}
