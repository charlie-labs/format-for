import {
  type BlockContent,
  type DefinitionContent,
  type List,
  type PhrasingContent,
  type Root,
  type RootContent,
  type Table,
} from 'mdast';
import { toString } from 'mdast-util-to-string';

import { escapeSlackText } from '../utils/slackEscape.js';

type AnyChild = RootContent | BlockContent | DefinitionContent;

interface SlackRenderCtx {
  // Avoid spamming the same warning when many nested items are flattened
  flattenedListWarned: boolean;
  // Downgrade warnings (emit once per render)
  warnedInlineMath?: boolean;
  warnedDisplayMath?: boolean;
  warnedFootnotes?: boolean;
  // Collect footnote definitions to append at the end
  footnotes?: Map<string, string>;
}

import { type FormatOptions } from '../types.js';
import { warn } from '../utils/warn.js';

export function renderSlack(ast: Root, options?: FormatOptions): string {
  const out: string[] = [];
  const ctx: SlackRenderCtx = {
    flattenedListWarned: false,
    footnotes: new Map<string, string>(),
  };
  renderNodes(ast.children, out, 0, ctx, options);
  // Append collected footnotes, if any
  if (ctx.footnotes && ctx.footnotes.size > 0) {
    out.push('Footnotes:\n');
    for (const [id, text] of ctx.footnotes) {
      out.push(`[${id}] ${text}\n`);
    }
  }
  // normalize excessive blank lines
  return out.join('').replace(/\n{3,}/g, '\n\n');
}

// Slack mrkdwn link labels live inside `<url|label>` and must not include raw `|`, `<`, `>`, or `&`.
// This escapes those characters and avoids double-escaping common entities already present
// in `renderInline(...)` output (e.g., `&amp;`, `&lt;`, `&gt;`, `&#124;`).
function escapeSlackLabel(t: string): string {
  return (
    String(t)
      // Escape ampersands except when they start a known entity we emit elsewhere
      .replace(/&(?!(?:amp|lt|gt|#124);)/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\|/g, '&#124;')
  );
}

function imageWarnMessage(options?: FormatOptions): string {
  const style = options?.target?.slack?.images?.style ?? 'link';
  return style === 'url'
    ? 'Slack: images emitted as URLs'
    : 'Slack: images emitted as links';
}

function formatSlackImage(
  url: string | undefined,
  alt: string | null | undefined,
  options?: FormatOptions
): string {
  const style = options?.target?.slack?.images?.style ?? 'link';
  const emptyAltLabel =
    options?.target?.slack?.images?.emptyAltLabel ?? 'image';
  const altText = (alt ?? '').trim();
  const labelRaw = altText.length > 0 ? altText : emptyAltLabel;

  // Normalize URL (trim) and check presence
  const urlStr = typeof url === 'string' ? url.trim() : '';
  const hasUrl = urlStr.length > 0;

  // Without a URL, avoid emitting an invalid Slack link token like `<|label>`
  if (!hasUrl) return escapeSlackLabel(labelRaw);

  if (style === 'url') {
    return urlStr;
  }
  const label = escapeSlackLabel(labelRaw);
  return `<${urlStr}|${label}>`;
}

function renderNodes(
  nodes: AnyChild[],
  out: string[],
  depth: number,
  ctx: SlackRenderCtx,
  options?: FormatOptions
): void {
  // Index-based iteration so we can look ahead at the next sibling for
  // spacing decisions (e.g., blockquote followed by paragraph).
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n) continue;
    if (n.type === 'paragraph') {
      // Detect display math-like blocks of the shape:
      //   $$\n...\n$$
      // and downgrade to a fenced code block.
      const pText = toString(n);
      const m = /^\s*\$\$\s*\n([\s\S]*?)\n\s*\$\$\s*$/.exec(pText);
      if (m) {
        if (!ctx.warnedDisplayMath) {
          warn(
            'Slack: display math downgraded to code block',
            options?.warnings
          );
          ctx.warnedDisplayMath = true;
        }
        const inner = m[1] ?? '';
        out.push('```\n', inner, '\n```\n\n');
      } else {
        out.push(renderInline(n.children, ctx, options), '\n\n');
      }
      continue;
    }
    if (n.type === 'heading') {
      const content = renderInline(n.children, ctx, options);
      out.push(`*${content}*\n\n`);
      continue;
    }
    if (n.type === 'blockquote') {
      const inner = renderBlockQuoted(n.children, ctx, options);
      out.push(inner, '\n');
      // Visual break after a quote when followed by a paragraph.
      // Do not add when the next block is another blockquote.
      const next = nodes[i + 1];
      if (next && (next.type === 'paragraph' || next.type === 'heading')) {
        out.push('\n');
      }
      continue;
    }
    if (n.type === 'list') {
      renderList(n, out, depth, ctx, options);
      continue;
    }
    if (n.type === 'thematicBreak') {
      out.push('---\n\n');
      continue;
    }
    if (n.type === 'footnoteDefinition') {
      // Collect to append at the end as `[n] text` under a "Footnotes:" section
      const id = n.identifier ?? '';
      const content = renderInline(flattenParagraph(n.children), ctx, options);
      ctx.footnotes?.set(String(id), content);
      if (!ctx.warnedFootnotes) {
        warn(
          'Slack: footnotes converted to inline caret + appended refs',
          options?.warnings
        );
        ctx.warnedFootnotes = true;
      }
      continue;
    }
    if (n.type === 'code') {
      out.push('```\n', n.value ?? '', '\n```\n\n');
      continue;
    }
    if (n.type === 'table') {
      warn('Slack: table downgraded to code block', options?.warnings);
      out.push('```\n', tableToText(n, ctx, options), '\n```\n\n');
      continue;
    }
    if (n.type === 'image') {
      warn(imageWarnMessage(options), options?.warnings);
      out.push(formatSlackImage(n.url, n.alt, options), '\n\n');
      continue;
    }
    if (n.type === 'html') {
      warn('Slack: HTML stripped', options?.warnings);
      continue;
    }
    if (n.type === 'details') {
      const summary = n.data?.summary ?? 'Details';
      out.push(`*${escapeSlackText(summary)}*\n`);
      const body = renderBlockQuoted(n.children, ctx, options);
      out.push(body, '\n');
      continue;
    }
  }
}

function renderInline(
  children: PhrasingContent[],
  ctx?: SlackRenderCtx,
  options?: FormatOptions
): string {
  let s = '';
  for (const c of children) {
    if (c.type === 'break') {
      s += '\n';
      continue;
    }
    if (c.type === 'text') {
      s += downgradeInlineMathInText(c.value ?? '', ctx, options);
      continue;
    }
    if (c.type === 'emphasis') {
      s += `_${renderInline(c.children, ctx, options)}_`;
      continue;
    }
    if (c.type === 'strong') {
      s += `*${renderInline(c.children, ctx, options)}*`;
      continue;
    }
    if (c.type === 'delete') {
      s += `~${renderInline(c.children, ctx, options)}~`;
      continue;
    }
    if (c.type === 'inlineCode') {
      s += '`' + String(c.value ?? '') + '`';
      continue;
    }
    if (c.type === 'link') {
      // Normalize and guard the URL to avoid emitting invalid tokens like `<|label>`
      const raw = typeof c.url === 'string' ? c.url.trim() : '';
      const label = escapeSlackLabel(renderInline(c.children, ctx, options));
      if (raw.length === 0) {
        s += label; // no URL => just the label
      } else if (label.length === 0) {
        s += `<${raw}>`; // no label => bare URL (avoid `<url|>`)
      } else {
        s += `<${raw}|${label}>`;
      }
      continue;
    }
    if (c.type === 'image') {
      // Slack doesn't support inline images in mrkdwn; emit as a link or URL
      // (per options) and warn to make the downgrade visible in fixtures/tests.
      warn(imageWarnMessage(options), options?.warnings);
      s += formatSlackImage(c.url, c.alt, options);
      continue;
    }
    if (c.type === 'footnoteReference') {
      const id = c.identifier ?? '';
      // Warning is emitted when collecting definitions, to avoid duplicate and
      // to align with fixture expectations.
      s += `^[${id}]`;
      continue;
    }
    if (c.type === 'mention') {
      if (c.data?.subtype === 'user' && c.data.id) {
        s += `<@${c.data.id}>`;
      } else if (c.data?.subtype === 'channel' && c.data.id && c.data.label) {
        s += `<#${c.data.id}|${c.data.label}>`;
      } else if (c.data?.subtype === 'special' && c.data.id) {
        s += `<!${c.data.id}>`;
      } else {
        s += renderInline(c.children, ctx, options);
      }
      continue;
    }
    if (c.type === 'html') {
      s += escapeSlackText(c.value ?? '');
      continue;
    }
  }
  return s;
}

function renderList(
  node: List,
  out: string[],
  depth: number,
  ctx: SlackRenderCtx,
  options?: FormatOptions
): void {
  const configured = options?.target?.slack?.lists?.maxDepth;
  const maxDepth =
    typeof configured === 'number' && Number.isFinite(configured)
      ? Math.max(1, Math.floor(configured))
      : 2;
  const flattened = depth + 1 > maxDepth;
  if (flattened) {
    if (!ctx.flattenedListWarned) {
      warn(`Slack: flattened list depth > ${maxDepth}`, options?.warnings);
      ctx.flattenedListWarned = true;
    }
  }

  const start = typeof node.start === 'number' ? node.start : 1;

  for (let idx = 0; idx < node.children.length; idx++) {
    const item = node.children[idx];
    if (!item) continue;
    const bullet = node.ordered ? `${start + idx}.` : '•';
    const indent = '   '.repeat(Math.max(0, Math.min(depth, maxDepth - 1)));
    const prefix = flattened ? `${indent}→` : `${indent}${bullet}`;

    const nonListBlocks = item.children.filter((c) => c.type !== 'list');
    const nestedLists = item.children.filter(
      (c): c is List => c.type === 'list'
    );

    const content = renderInline(flattenParagraph(nonListBlocks), ctx, options);
    // Build the list line from parts to keep spacing simple and predictable.
    // Parts: prefix (bullet/indent) + optional task marker + optional inline content.
    const parts: string[] = [prefix];
    if (typeof item.checked === 'boolean') {
      parts.push(item.checked ? '[x]' : '[ ]');
    }
    const hasContent = content.length > 0;
    if (hasContent) {
      parts.push(content);
    }
    let line = parts.join(' ');
    // Compatibility: only trim when there is no inline content to avoid removing
    // any intentional trailing spaces that may exist within `content`.
    if (!hasContent) {
      line = line.trimEnd();
    }
    out.push(`${line}\n`);

    for (const nl of nestedLists) {
      renderList(nl, out, depth + 1, ctx, options);
    }
    if (node.spread) {
      out.push('\n');
    }
  }
  if (out[out.length - 1] !== '\n\n') {
    out.push('\n');
  }
}

function renderBlockQuoted(
  children: Root['children'],
  ctx: SlackRenderCtx,
  options?: FormatOptions
): string {
  const tmp: string[] = [];
  renderNodes(children, tmp, 0, ctx, options);
  const text = tmp.join('').trimEnd();
  const lines = text.split('\n');
  return lines.map((l) => (l ? `> ${l}` : '>')).join('\n');
}

function flattenParagraph(
  nodes: (BlockContent | DefinitionContent)[]
): PhrasingContent[] {
  const parts: PhrasingContent[] = [];
  for (const n of nodes) {
    if (n.type === 'paragraph') {
      parts.push(...n.children);
    } else if (n.type === 'blockquote') {
      parts.push(...flattenParagraph(n.children));
    } else {
      // ignore other block nodes here; they are rendered elsewhere
    }
  }
  return parts;
}

function tableToText(
  table: Table,
  ctx?: SlackRenderCtx,
  options?: FormatOptions
): string {
  const rows = table.children;
  return rows
    .map((row) =>
      row.children
        .map((cell) => renderInline(cell.children, ctx, options))
        .join(' | ')
    )
    .join('\n');
}

function downgradeInlineMathInText(
  text: string,
  ctx?: SlackRenderCtx,
  options?: FormatOptions
): string {
  // Fast path: no dollar signs
  if (!text.includes('$')) return escapeSlackText(text);

  let out = '';
  let i = 0;
  const s = text;

  while (i < s.length) {
    const ch = s[i];
    if (ch !== '$') {
      // Accumulate a run of non-$ characters to escape in one go
      const start = i;
      while (i < s.length && s[i] !== '$') i++;
      out += escapeSlackText(s.slice(start, i));
      continue;
    }

    // Potential math; distinguish $$ (display) from $ (inline)
    const next = s[i + 1];
    if (next === '$') {
      // Leave the $$ tokens as-is here; paragraph-level handler will render blocks
      out += escapeSlackText('$$');
      i += 2;
      continue;
    }

    // Find the closing unescaped $ on the same line
    let j = i + 1;
    let found = -1;
    while (j < s.length) {
      const cj = s[j];
      if (cj === '\n') break; // inline math must be on a single line
      if (cj === '$') {
        found = j;
        break;
      }
      j++;
    }

    if (found !== -1) {
      const inner = s.slice(i + 1, found);
      if (!ctx?.warnedInlineMath) {
        warn('Slack: inline math downgraded to code span', options?.warnings);
        if (ctx) ctx.warnedInlineMath = true;
      }
      out += '`' + inner + '`';
      i = found + 1;
    } else {
      // No closing $, treat as literal
      out += escapeSlackText('$');
      i += 1;
    }
  }

  return out;
}
