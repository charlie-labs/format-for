/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { escapeSlackText } from '../utils/slackEscape.js';

export function renderSlack(ast: any): string {
  const out: string[] = [];
  renderNodes(ast.children ?? [], out, 0);
  // normalize excessive blank lines
  return out.join('').replace(/\n{3,}/g, '\n\n');
}

function renderNodes(nodes: any[], out: string[], depth: number) {
  for (const n of nodes) {
    switch (n.type) {
      case 'paragraph':
        out.push(renderInline(n.children ?? []), '\n\n');
        break;
      case 'heading': {
        const content = renderInline(n.children ?? []);
        out.push(`*${content}*\n\n`);
        break;
      }
      case 'blockquote': {
        const inner = renderBlockQuoted(n.children ?? []);
        out.push(inner, '\n');
        break;
      }
      case 'list':
        renderList(n, out, depth);
        break;
      case 'thematicBreak':
        out.push('---\n\n');
        break;
      case 'code':
        out.push('```\n', n.value ?? '', '\n```\n\n');
        break;
      case 'table':
        console.warn('Slack: table downgraded to code block');
        out.push('```\n', tableToText(n), '\n```\n\n');
        break;
      case 'image':
        console.warn('Slack: images emitted as links');
        out.push(`<${n.url}|${n.alt || 'image'}>\n\n`);
        break;
      case 'html':
        console.warn('Slack: HTML stripped');
        break;
      case 'details': {
        const summary = n.data?.summary ?? 'Details';
        out.push(`*${escapeSlackText(summary)}*\n`);
        const body = renderBlockQuoted(n.children ?? []);
        out.push(body, '\n');
        break;
      }
      default: {
        if (Array.isArray(n.children)) {
          out.push(renderInline(n.children), '\n\n');
        }
      }
    }
  }
}

function renderInline(children: any[]): string {
  let s = '';
  for (const c of children) {
    switch (c.type) {
      case 'text':
        s += escapeSlackText(c.value ?? '');
        break;
      case 'emphasis':
        s += `_${renderInline(c.children ?? [])}_`;
        break;
      case 'strong':
        s += `*${renderInline(c.children ?? [])}*`;
        break;
      case 'delete':
        s += `~${renderInline(c.children ?? [])}~`;
        break;
      case 'inlineCode':
        s += '`' + String(c.value ?? '') + '`';
        break;
      case 'link':
        s += `<${c.url}|${renderInline(c.children ?? [])}>`;
        break;
      case 'mention': {
        const d = c.data || {};
        if (d.subtype === 'user' && d.id) {
          s += `<@${d.id}>`;
        } else if (d.subtype === 'channel' && d.id && d.label) {
          s += `<#${d.id}|${d.label}>`;
        } else if (d.subtype === 'special' && d.id) {
          s += `<!${d.id}>`;
        } else {
          s += renderInline(c.children ?? []);
        }
        break;
      }
      default:
        if (Array.isArray(c.children)) {
          s += renderInline(c.children);
        } else if (typeof c.value === 'string') {
          s += escapeSlackText(c.value);
        }
    }
  }
  return s;
}

function renderList(node: any, out: string[], depth: number) {
  const maxDepth = 2;
  const flattened = depth + 1 > maxDepth;
  if (flattened) {
    console.warn('Slack: flattened list depth > 2');
  }

  const start = typeof node.start === 'number' ? node.start : 1;

  for (let idx = 0; idx < (node.children?.length ?? 0); idx++) {
    const item = node.children[idx];
    const bullet = node.ordered ? `${start + idx}.` : '•';
    const indent = '   '.repeat(Math.min(depth, maxDepth - 1));
    const prefix = flattened ? `${indent}→` : `${indent}${bullet}`;

    const nonListBlocks = (item.children ?? []).filter(
      (c: any) => c.type !== 'list'
    );
    const nestedLists = (item.children ?? []).filter(
      (c: any) => c.type === 'list'
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

function renderBlockQuoted(children: any[]): string {
  const tmp: string[] = [];
  renderNodes(children, tmp, 0);
  const text = tmp.join('').trimEnd();
  const lines = text.split('\n');
  return lines.map((l) => (l ? `> ${l}` : '>')).join('\n');
}

function flattenParagraph(nodes: any[]): any[] {
  const parts: any[] = [];
  for (const n of nodes) {
    if (n.type === 'paragraph') {
      parts.push(...(n.children ?? []));
    } else if (Array.isArray(n.children)) {
      parts.push(...flattenParagraph(n.children));
    } else {
      parts.push(n);
    }
  }
  return parts;
}

function tableToText(table: any): string {
  const rows = table.children ?? [];
  return rows
    .map((row: any) =>
      row.children
        .map((cell: any) => renderInline(cell.children ?? []))
        .join(' | ')
    )
    .join('\n');
}
