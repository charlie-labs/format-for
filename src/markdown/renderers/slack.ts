/* eslint-disable no-console */
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

export function renderSlack(ast: Root): string {
  const out: string[] = [];
  const ctx: SlackRenderCtx = {
    flattenedListWarned: false,
    footnotes: new Map<string, string>(),
  };
  renderNodes(ast.children, out, 0, ctx);
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

function renderNodes(
  nodes: AnyChild[],
  out: string[],
  depth: number,
  ctx: SlackRenderCtx
): void {
  for (const n of nodes) {
    if (n.type === 'paragraph') {
      // Detect display math-like blocks of the shape:
      //   $$\n...\n$$
      // and downgrade to a fenced code block.
      const pText = toString(n);
      const m = /^\s*\$\$\s*\n([\s\S]*?)\n\s*\$\$\s*$/.exec(pText);
      if (m) {
        if (!ctx.warnedDisplayMath) {
          console.warn('Slack: display math downgraded to code block');
          ctx.warnedDisplayMath = true;
        }
        const inner = m[1] ?? '';
        out.push('```\n', inner, '\n```\n\n');
      } else {
        out.push(renderInline(n.children, ctx), '\n\n');
      }
      continue;
    }
    if (n.type === 'heading') {
      const content = renderInline(n.children, ctx);
      out.push(`*${content}*\n\n`);
      continue;
    }
    if (n.type === 'blockquote') {
      const inner = renderBlockQuoted(n.children, ctx);
      out.push(inner, '\n');
      continue;
    }
    if (n.type === 'list') {
      renderList(n, out, depth, ctx);
      continue;
    }
    if (n.type === 'thematicBreak') {
      out.push('---\n\n');
      continue;
    }
    if (n.type === 'footnoteDefinition') {
      // Collect to append at the end as `[n] text` under a "Footnotes:" section
      const id = n.identifier ?? '';
      const content = renderInline(flattenParagraph(n.children), ctx);
      ctx.footnotes?.set(String(id), content);
      if (!ctx.warnedFootnotes) {
        console.warn(
          'Slack: footnotes converted to inline caret + appended refs'
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
      console.warn('Slack: table downgraded to code block');
      out.push('```\n', tableToText(n, ctx), '\n```\n\n');
      continue;
    }
    if (n.type === 'image') {
      console.warn('Slack: images emitted as links');
      const label = escapeSlackLabel(n.alt || 'image');
      out.push(`<${n.url}|${label}>\n\n`);
      continue;
    }
    if (n.type === 'html') {
      console.warn('Slack: HTML stripped');
      continue;
    }
    if (n.type === 'details') {
      const summary = n.data?.summary ?? 'Details';
      out.push(`*${escapeSlackText(summary)}*\n`);
      const body = renderBlockQuoted(n.children, ctx);
      out.push(body, '\n');
      continue;
    }
  }
}

function renderInline(
  children: PhrasingContent[],
  ctx?: SlackRenderCtx
): string {
  let s = '';
  for (const c of children) {
    if (c.type === 'break') {
      s += '\n';
      continue;
    }
    if (c.type === 'text') {
      s += downgradeInlineMathInText(c.value ?? '', ctx);
      continue;
    }
    if (c.type === 'emphasis') {
      s += `_${renderInline(c.children, ctx)}_`;
      continue;
    }
    if (c.type === 'strong') {
      s += `*${renderInline(c.children, ctx)}*`;
      continue;
    }
    if (c.type === 'delete') {
      s += `~${renderInline(c.children, ctx)}~`;
      continue;
    }
    if (c.type === 'inlineCode') {
      s += '`' + String(c.value ?? '') + '`';
      continue;
    }
    if (c.type === 'link') {
      const label = escapeSlackLabel(renderInline(c.children, ctx));
      s += `<${c.url}|${label}>`;
      continue;
    }
    if (c.type === 'image') {
      // Slack doesn't support inline images in mrkdwn; emit as a link instead
      // and warn to make the downgrade visible in fixtures/tests.
      console.warn('Slack: images emitted as links');
      const label = escapeSlackLabel(c.alt || 'image');
      s += `<${c.url}|${label}>`;
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
        s += renderInline(c.children, ctx);
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
  ctx: SlackRenderCtx
): void {
  const maxDepth = 2;
  const flattened = depth + 1 > maxDepth;
  if (flattened) {
    if (!ctx.flattenedListWarned) {
      console.warn('Slack: flattened list depth > 2');
      ctx.flattenedListWarned = true;
    }
  }

  const start = typeof node.start === 'number' ? node.start : 1;

  for (let idx = 0; idx < node.children.length; idx++) {
    const item = node.children[idx];
    if (!item) continue;
    const bullet = node.ordered ? `${start + idx}.` : '•';
    const indent = '   '.repeat(Math.min(depth, maxDepth - 1));
    const prefix = flattened ? `${indent}→` : `${indent}${bullet}`;

    const nonListBlocks = item.children.filter((c) => c.type !== 'list');
    const nestedLists = item.children.filter(
      (c): c is List => c.type === 'list'
    );
    const content = renderInline(flattenParagraph(nonListBlocks), ctx);
    out.push(`${prefix} ${content}\n`);

    for (const nl of nestedLists) {
      renderList(nl, out, depth + 1, ctx);
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
  ctx: SlackRenderCtx
): string {
  const tmp: string[] = [];
  renderNodes(children, tmp, 0, ctx);
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

function tableToText(table: Table, ctx?: SlackRenderCtx): string {
  const rows = table.children;
  return rows
    .map((row) =>
      row.children.map((cell) => renderInline(cell.children, ctx)).join(' | ')
    )
    .join('\n');
}

function downgradeInlineMathInText(text: string, ctx?: SlackRenderCtx): string {
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
        console.warn('Slack: inline math downgraded to code span');
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
