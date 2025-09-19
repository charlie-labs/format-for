import { type Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import { remarkCanonicalizeMixed } from './plugins/canonicalize.js';

export interface ParseOptions {
  // Placeholders for future use (maps/autolinks), not used directly today.
  maps?: unknown;
  autolinks?: unknown;
}

export function parseToCanonicalMdast(
  input: string,
  _opts: ParseOptions = {}
): Root {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkCanonicalizeMixed);
  const tree = processor.parse(input);
  processor.runSync(tree);
  return tree;
}
