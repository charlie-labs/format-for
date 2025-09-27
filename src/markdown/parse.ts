import { type Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import { remarkCanonicalizeMixed } from './plugins/canonicalize.js';
import { remarkFixLiteralNewlines } from './plugins/fixLiteralNewlines.js';
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
    maps?: MentionMaps;
    autolinks?: AutoLinkRule[];
    target?: FormatTarget;
  } = {}
): Root {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkCanonicalizeMixed, {
      maps: opts.maps ?? {},
      autolinks: opts.autolinks ?? [],
      // Provide the raw source so the canonicalizer can make
      // position-aware decisions (e.g., Slack input flavor detection).
      source: input,
      target: opts.target,
    })
    // Replace literal "\n" with `break` nodes (hard line breaks), skipping code.
    .use(remarkFixLiteralNewlines);

  const ast = processor.parse(String(input));
  // Apply transforms synchronously to produce the canonical tree
  const out = processor.runSync(ast);
  assertIsRoot(out);
  return out;
}
