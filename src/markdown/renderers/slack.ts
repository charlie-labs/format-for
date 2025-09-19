/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion */
import { type Content, type List, type Table } from 'mdast';

import { escapeSlackText } from '../utils/slackEscape.js';

type MentionNode = {
  type: 'mention';
  data: { subtype: 'user' | 'channel' | 'special'; id: string; label?: string };
};
type ContentOrMention = Content | MentionNode;

export function renderSlack(ast: unknown): string {
  const warnOnce = createWarnOnce();
  const out: string[] = [];
  const root = (ast as { children?: unknown[] }) ?? {};
  renderNodes((root.children ?? []) as ContentOrMention[], out, 0, warnOnce);
  return out.join('').replace(/\n{3,}/g, '\n\n');
}

function renderNodes(
  nodes: ContentOrMention[],
  out: string[],
  depth: number,
  warnOnce: WarnOnce
) {
  for (const node of nodes) {
    switch ((node as any).type) {
      case 'paragraph':
        out.push(
          renderInline(
            ((node as any).children ?? []) as ContentOrMention[],
            warnOnce
          ),
          '\n\n'
        );
        break;
      case 'heading': {
        const text = renderInline(
          ((node as any).children ?? []) as ContentOrMention[],
          warnOnce
        );
        out.push(`*${text}*\n\n`);
        break;
      }
      case 'thematicBreak':
        out.push('\n—\n\n');
        break;
      case 'blockquote': {
        const inner = renderBlockQuoted(
          ((node as any).children ?? []) as ContentOrMention[],
          warnOnce
        );
        out.push(inner, '\n');
        break;
      }
      case 'list':
        renderList(node as List, out, depth, warnOnce);
        break;
      case 'code':
        out.push(
          '```',
          (node as any).lang ?? '',
          '\n',
          (node as any).value ?? '',
          '\n```\n\n'
        );
        break;
      case 'table':
        warnOnce('Slack: table downgraded to code block');
        out.push('```\n', tableToText(node as Table), '\n```\n\n');
        break;
      case 'html':
        // Strip HTML entirely
        warnOnce('Slack: HTML stripped');
        break;
      case 'details': {
        // Render summary bold + indented body
        const summary = String((node as any)?.data?.summary ?? 'Details');
        out.push(`*${escapeSlackText(summary)}*\n`);
        // indent body by 2 spaces
        const body = renderNodesToString(
          ((node as any).children ?? []) as ContentOrMention[],
          warnOnce
        )
          .split('\n')
          .map((l) => (l.length ? `  ${l}` : l))
          .join('\n');
        out.push(body, '\n\n');
        break;
      }
      default: {
        if (Array.isArray((node as any).children)) {
          out.push(
            renderInline(
              ((node as any).children ?? []) as ContentOrMention[],
              warnOnce
            ),
            '\n\n'
          );
        }
      }
    }
  }
}

function renderInline(nodes: ContentOrMention[], warnOnce: WarnOnce): string {
  const out: string[] = [];
  for (const n of nodes) {
    switch ((n as any).type) {
      case 'text':
        out.push(escapeSlackText((n as any).value ?? ''));
        break;
      case 'emphasis':
        out.push(
          `_${renderInline(((n as any).children ?? []) as ContentOrMention[], warnOnce)}_`
        );
        break;
      case 'strong':
        out.push(
          `*${renderInline(((n as any).children ?? []) as ContentOrMention[], warnOnce)}*`
        );
        break;
      case 'delete':
        out.push(
          `~${renderInline(((n as any).children ?? []) as ContentOrMention[], warnOnce)}~`
        );
        break;
      case 'inlineCode':
        out.push('`', (n as any).value ?? '', '`');
        break;
      case 'break':
        out.push('\n');
        break;
      case 'link': {
        const label =
          renderInline(
            ((n as any).children ?? []) as ContentOrMention[],
            warnOnce
          ) || (n as any).url;
        out.push(`<${(n as any).url}|${label}>`);
        break;
      }
      case 'image': {
        warnOnce('Slack: image downgraded to link');
        const alt = (n as any).alt ?? (n as any).url;
        out.push(`<${(n as any).url}|${escapeSlackText(alt)}>\n`);
        break;
      }
      case 'mention': {
        const mn = n as MentionNode;
        const st = mn.data?.subtype;
        if (st === 'user') {
          out.push(`<@${mn.data.id}>`);
        } else if (st === 'channel') {
          out.push(`<#${mn.data.id}|${mn.data.label ?? ''}>`);
        } else if (st === 'special') {
          out.push(`<!${mn.data.id}>`);
        }
        break;
      }
      default: {
        if (Array.isArray((n as any).children)) {
          out.push(
            renderInline(
              ((n as any).children ?? []) as ContentOrMention[],
              warnOnce
            )
          );
        }
      }
    }
  }
  return out.join('');
}

function renderList(
  node: List,
  out: string[],
  depth: number,
  warnOnce: WarnOnce
) {
  const isOrdered = node.ordered === true;
  const start = typeof node.start === 'number' ? (node.start as number) : 1;
  let index = start;
  for (const item of node.children ?? []) {
    const bullet = isOrdered ? `${index}.` : '•';
    const d = depth >= 2 ? 0 : depth; // flatten beyond 2
    if (depth >= 2) warnOnce('Slack: nested list depth>2 flattened');
    out.push(`${'  '.repeat(d)}${bullet} `);
    const c0 = (item as any).children?.[0];
    if (
      c0?.type === 'paragraph' &&
      Array.isArray(c0.children) &&
      (c0 as any).checked !== undefined
    ) {
      const mark = (c0 as any).checked ? '[x] ' : '[ ] ';
      out.push(mark);
    }
    const lines = renderNodesToString(
      ((item as any).children ?? []) as ContentOrMention[],
      warnOnce
    ).trimEnd();
    out.push(lines.replace(/\n/g, '\n' + '  '.repeat(d + 1)), '\n');
    index++;
  }
  out.push('\n');
}

function renderBlockQuoted(
  children: ContentOrMention[],
  warnOnce: WarnOnce
): string {
  const inner = renderNodesToString(children, warnOnce).trimEnd();
  return (
    inner
      .split('\n')
      .map((l) => `> ${l}`)
      .join('\n') + '\n\n'
  );
}

function renderNodesToString(
  nodes: ContentOrMention[],
  warnOnce: WarnOnce
): string {
  const buf: string[] = [];
  renderNodes(nodes, buf, 0, warnOnce);
  return buf.join('');
}

function tableToText(table: Table): string {
  const rows: string[][] = [];
  for (const row of table.children ?? []) {
    const NO_WARN: WarnOnce = () => {
      return;
    };
    const cells = (row.children ?? []).map((c) =>
      renderInline(((c as any).children ?? []) as ContentOrMention[], NO_WARN)
    );
    rows.push(cells);
  }
  const widths =
    rows[0]?.map((_, i) => Math.max(...rows.map((r) => r[i]?.length ?? 0))) ??
    [];
  const lines = rows.map((r) =>
    r.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join(' | ')
  );
  return lines.join('\n');
}

type WarnOnce = (msg: string) => void;
function createWarnOnce(): WarnOnce {
  const seen = new Set<string>();
  return (msg: string) => {
    if (seen.has(msg)) return;
    seen.add(msg);
    // eslint-disable-next-line no-console
    console.warn(msg);
  };
}
