/* eslint-disable no-console */
import {
  type Content,
  type List,
  type PhrasingContent,
  type Root,
  type Table,
  type TableCell,
} from 'mdast';

import { slackEscape } from '../utils/slackEscape.js';

type WarnSet = Set<string>;

export function renderSlack(ast: Root): string {
  const warnings: WarnSet = new Set();
  const out = printRoot(ast, warnings);
  for (const w of warnings) console.warn(w);
  return out;
}

function printRoot(root: Root, warnings: WarnSet): string {
  return root.children.map((c) => block(c, warnings, 1)).join('\n\n');
}

function block(node: Content, warnings: WarnSet, depth: number): string {
  switch (node.type) {
    case 'paragraph':
      return inline(node.children, warnings);
    case 'heading': {
      const text = inline(node.children, warnings);
      return `*${text.trim()}*`;
    }
    case 'blockquote': {
      const inner = node.children
        .map((c) => block(c, warnings, depth))
        .join('\n');
      const lines = inner.split(/\n/).map((l) => `> ${l}`);
      return lines.join('\n');
    }
    case 'code': {
      const fence = '```';
      const code = node.value ?? '';
      return `${fence}\n${code}\n${fence}`;
    }
    case 'thematicBreak':
      return '---';
    case 'list':
      return renderList(node, warnings, depth);
    case 'table':
      warnings.add('Slack: table downgraded to code block');
      return fenceTable(node);
    case 'html': {
      const v = node.value;
      // Preserve Slack angle forms (<@U…>, <#C…|name>, <!here>)
      if (/^<[@#!][^>]+>$/.test(v)) return v;
      warnings.add('Slack: stripped raw HTML');
      return '';
    }
    default:
      return '';
  }
}

function inline(nodes: PhrasingContent[], warnings: WarnSet): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'text':
          return slackEscape(mapMentions(n.value));
        case 'strong':
          return `*${inline(n.children, warnings)}*`;
        case 'emphasis':
          return `_${inline(n.children, warnings)}_`;
        case 'delete':
          return `~${inline(n.children, warnings)}~`;
        case 'inlineCode':
          return '`' + n.value + '`';
        case 'link': {
          const text = inline(n.children, warnings) || n.url;
          return `<${n.url}|${slackEscape(text)}>`;
        }
        case 'image': {
          warnings.add('Slack: image converted to link');
          const label = n.alt && n.alt.length > 0 ? n.alt : n.url;
          return `<${n.url}|${slackEscape(label)}>`;
        }
        case 'break':
          return '\n';
        case 'html': {
          const v = n.value;
          if (/^<[@#!][^>]+>$/.test(v)) return v; // keep Slack mentions
          // strip others
          warnings.add('Slack: stripped raw HTML');
          return '';
        }
        default:
          // Unknown inline
          return '';
      }
    })
    .join('');
}

function renderList(list: List, warnings: WarnSet, depth: number): string {
  const ordered = !!list.ordered;
  const start = list.start ?? 1;
  let idx = 0;
  const lines: string[] = [];
  for (const item of list.children) {
    const marker = ordered ? `${start + idx}.` : '•';
    idx++;
    const content = item.children
      .map((c) => {
        if (c.type === 'paragraph') return inline(c.children, warnings);
        if (c.type === 'list') return renderList(c, warnings, depth + 1);
        return block(c, warnings, depth + 1);
      })
      .join('\n');

    // Task list handling
    const check = item.checked;
    const checkbox = check == null ? '' : check ? '[x] ' : '[ ] ';

    const pad = depth > 1 ? '  '.repeat(Math.min(depth - 1, 2)) : '';
    if (depth >= 3) warnings.add('Slack: nested lists ≥3 levels flattened');
    lines.push(`${pad}${marker} ${checkbox}${content}`.trimEnd());
  }
  return lines.join('\n');
}

function fenceTable(table: Table): string {
  // Build a simple GitHub-style table string, then wrap in ``` block
  const header = table.children[0];
  const body = table.children.slice(1);
  const headerCells = header ? header.children : [];
  const head = `| ${headerCells.map((c) => cellText(c)).join(' | ')} |`;
  const sep = `| ${headerCells.map(() => '---').join(' | ')} |`;
  const rows = body.map(
    (r) => `| ${r.children.map((c) => cellText(c)).join(' | ')} |`
  );
  const md = [head, sep, ...rows].join('\n');
  return '```\n' + md + '\n```';
}

function cellText(c: TableCell): string {
  const t = c.children.map((n) => (n.type === 'text' ? n.value : '')).join('');
  return t.replace(/\n/g, ' ');
}

function mapMentions(text: string): string {
  // Convert @here/@channel/@everyone
  const out = text.replace(
    /@(here|channel|everyone)\b/g,
    (_m, g1) => `<!${g1}>`
  );
  // Note: user/channel maps are applied later by callers through options; here we only escape
  return out;
}
