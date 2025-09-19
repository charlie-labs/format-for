type AnyRoot = { type: 'root'; children: unknown[] };
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import { remarkCanonicalizeMixed } from './plugins/canonicalize.js';
import { type AutoLinkRule, type MentionMaps } from './types.js';

/**
 * Simple pre-parser for Linear collapsibles ("+++ Title" blocks).
 * We scan the raw string and break it into segments of either raw markdown
 * or a details block. The details body is parsed recursively.
 */
function splitLinearCollapsibles(
  input: string
): (
  | { kind: 'raw'; text: string }
  | { kind: 'details'; summary: string; body: string }
)[] {
  const lines = input.split(/\r?\n/);
  const out: (
    | { kind: 'raw'; text: string }
    | { kind: 'details'; summary: string; body: string }
  )[] = [];
  let i = 0;
  let rawBuf: string[] = [];
  while (i < lines.length) {
    const m = /^\s*\+\+\+\s*(.+)\s*$/.exec(lines[i] ?? '');
    if (m) {
      // flush raw
      if (rawBuf.length) {
        out.push({ kind: 'raw', text: rawBuf.join('\n') + '\n' });
        rawBuf = [];
      }
      const summary = (m[1] ?? '').trim();
      i++;
      const bodyLines: string[] = [];
      let closed = false;
      for (; i < lines.length; i++) {
        if (/^\s*\+\+\+\s*$/.test(lines[i] ?? '')) {
          closed = true;
          i++; // consume closing line
          break;
        }
        bodyLines.push(lines[i] ?? '');
      }
      const body = bodyLines.join('\n').replace(/\n*$/, '');
      out.push({ kind: 'details', summary, body });
      if (!closed && i >= lines.length) {
        // Unclosed: treat as raw fallback
        const last = out.pop();
        if (last && last.kind === 'details') {
          out.push({ kind: 'raw', text: `+++ ${last.summary}\n${last.body}` });
        }
      }
      continue;
    }
    rawBuf.push(lines[i] ?? '');
    i++;
  }
  if (rawBuf.length) out.push({ kind: 'raw', text: rawBuf.join('\n') });
  return out;
}

const baseParser = () => unified().use(remarkParse).use(remarkGfm);

/**
 * Parse mixed Slack/Linear/GFM to a canonical mdast Root.
 * Slack angle forms and Linear '+++' are handled by lightweight transforms.
 */
export function parseToCanonicalMdast(
  input: string,
  opts: { maps?: MentionMaps; autolinks?: { linear?: AutoLinkRule[] } } = {}
): AnyRoot {
  const segments = splitLinearCollapsibles(input);
  const root: AnyRoot = { type: 'root', children: [] };
  for (const seg of segments) {
    if (seg.kind === 'raw') {
      const tree = baseParser().parse(seg.text) as { children?: unknown[] };
      root.children.push(...(tree.children ?? []));
    } else if (seg.kind === 'details') {
      // Parse body to children
      const bodyAst = parseToCanonicalMdast(seg.body, opts);
      root.children.push({
        type: 'details',
        data: { summary: seg.summary },
        children: bodyAst.children,
      });
    }
  }

  // Run canonicalizer to normalize Slack/Linear specifics and autolinks
  const processor = unified().use(remarkCanonicalizeMixed, {
    maps: opts.maps,
    autolinks: opts.autolinks?.linear ?? [],
  });
  const normalized = processor.runSync(root as never) as AnyRoot;
  return normalized;
}
