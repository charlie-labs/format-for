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

import { escapeSlackText } from '../utils/slackEscape.js';

type AnyChild = RootContent | BlockContent | DefinitionContent;

export function renderSlack(ast: Root): string {
  const out: string[] = [];
  renderNodes(ast.children, out, 0);
  // normalize excessive blank lines
  return out.join('').replace(/\n{3,}/g, '\n\n');
}

function renderNodes(nodes: AnyChild[], out: string[], depth: number): void {
  for (const n of nodes) {
    if (n.type === 'paragraph') {
      out.push(renderInline(n.children), '\n\n');
      continue;
    }
    if (n.type === 'heading') {
      const content = renderInline(n.children);
      out.push(`*${content}*\n\n`);
      continue;
    }
    if (n.type === 'blockquote') {
      const inner = renderBlockQuoted(n.children);
      out.push(inner, '\n');
      continue;
    }
    if (n.type === 'list') {
      renderList(n, out, depth);
      continue;
    }
    if (n.type === 'thematicBreak') {
      out.push('---\n\n');
      continue;
    }
    if (n.type === 'footnoteDefinition') {
      const content = renderInline(flattenParagraph(n.children));
      out.push(content, '\n\n');
      continue;
    }
    if (n.type === 'code') {
      out.push('```\n', n.value ?? '', '\n```\n\n');
      continue;
    }
    if (n.type === 'table') {
      console.warn('Slack: table downgraded to code block');
      out.push('```\n', tableToText(n), '\n```\n\n');
      continue;
    }
    if (n.type === 'image') {
      console.warn('Slack: images emitted as links');
      out.push(`<${n.url}|${n.alt || 'image'}>\n\n`);
      continue;
    }
    if (n.type === 'html') {
      console.warn('Slack: HTML stripped');
      continue;
    }
    if (n.type === 'details') {
      const summary = n.data?.summary ?? 'Details';
      out.push(`*${escapeSlackText(summary)}*\n`);
      const body = renderBlockQuoted(n.children);
      out.push(body, '\n');
      continue;
    }
  }
}

function renderInline(children: PhrasingContent[]): string {
  let s = '';
  for (const c of children) {
    if (c.type === 'text') {
      s += escapeSlackText(c.value ?? '');
      continue;
    }
    if (c.type === 'emphasis') {
      s += `_${renderInline(c.children)}_`;
      continue;
    }
    if (c.type === 'strong') {
      s += `*${renderInline(c.children)}*`;
      continue;
    }
    if (c.type === 'delete') {
      s += `~${renderInline(c.children)}~`;
      continue;
    }
    if (c.type === 'inlineCode') {
      s += '`' + String(c.value ?? '') + '`';
      continue;
    }
    if (c.type === 'link') {
      s += `<${c.url}|${renderInline(c.children)}>`;
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
        s += renderInline(c.children);
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

function renderList(node: List, out: string[], depth: number): void {
  const maxDepth = 2;
  const flattened = depth + 1 > maxDepth;
  if (flattened) {
    console.warn('Slack: flattened list depth > 2');
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
    const content = renderInline(flattenParagraph(nonListBlocks));
    out.push(`${prefix} ${content}\n`);

    for (const nl of nestedLists) {
      renderList(nl, out, depth + 1);
    }
    if (!node.spread) {
      // tight list: no extra blank line
    } else {
      out.push('\n');
    }
  }
  if (out[out.length - 1] !== '\n\n') {
    out.push('\n');
  }
}

function renderBlockQuoted(children: Root['children']): string {
  const tmp: string[] = [];
  renderNodes(children, tmp, 0);
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

function tableToText(table: Table): string {
  const rows = table.children;
  return rows
    .map((row) =>
      row.children.map((cell) => renderInline(cell.children)).join(' | ')
    )
    .join('\n');
}
