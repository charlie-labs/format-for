import { type Content, type Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

export function renderGithub(ast: unknown): string {
  // Transform custom details nodes to HTML blocks for GitHub
  const cloned: Root = structuredClone(ast as Root);
  if (Array.isArray(cloned.children)) {
    cloned.children = cloned.children.map((n) =>
      isDetailsNode(n) ? detailsToHtml(n) : n
    );
  }
  const out = unified()
    .use(remarkStringify, { bullet: '-', fences: true, listItemIndent: 'one' })
    .use(remarkGfm)
    .stringify(cloned);
  return String(out);
}

type DetailsNode = {
  type: 'details';
  data?: { summary?: string };
  children?: Content[];
};
function isDetailsNode(n: unknown): n is DetailsNode {
  return Boolean(
    n && typeof n === 'object' && (n as { type?: unknown }).type === 'details'
  );
}

function detailsToHtml(node: DetailsNode): Content {
  const summary = String(node.data?.summary ?? 'Details');
  const body = toMarkdownChildren(node.children ?? []);
  const html = `<details><summary>${escapeHtml(summary)}</summary>\n\n${body}\n\n</details>`;
  return { type: 'html', value: html };
}

export function toMarkdownChildren(children: Content[]): string {
  const root: Root = { type: 'root', children };
  const s = unified().use(remarkStringify).use(remarkGfm).stringify(root);
  return s.trimEnd();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
