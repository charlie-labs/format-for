import { type Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

export function renderGithub(ast: Root): string {
  const processor = unified().use(remarkGfm).use(remarkStringify, {
    bullet: '-',
    fences: true,
    incrementListMarker: true,
  });
  return processor.stringify(ast);
}
