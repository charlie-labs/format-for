import {
  type Html,
  type Link,
  type ListItem,
  type Parent,
  type PhrasingContent,
  type Root,
  type Text,
} from 'mdast';
import { type Plugin } from 'unified';
import { CONTINUE, visit } from 'unist-util-visit';

import {
  type AutoLinkRule,
  type DetailsNode,
  type FormatTarget,
  type MentionMaps,
  type MentionNode,
} from '../types.js';

/**
 * Normalize mixed syntax into a canonical mdast:
 *  - Slack strikethrough: ~text~ -> delete
 *  - Slack angle forms & autolinks -> link/mention nodes
 *  - Linear @user -> link if mapped
 *  - Autolinks (e.g., BOT-123) via rules
 *  - Linear collapsible: paragraph starting with '+++ ' opens a block that must be
 *    closed by a standalone '+++' line. Collect all blocks until the matching
 *    closing fence, supporting nesting and ignoring any '+++' sequences that
 *    appear inside fenced code blocks (those are parsed as `code` nodes and
 *    therefore not considered here).
 */
export type CanonicalizeOptions = {
  maps?: MentionMaps;
  autolinks?: AutoLinkRule[];
  /**
   * Target-aware tweaks (optional). When provided, bare "@user" resolution will:
   *  - on Slack: use Slack `maps.slack.users` to emit a real mention (<@U…>)
   *  - on GitHub/Linear: use Linear `maps.linear.users` to emit a link to the profile
   * If omitted, behavior matches legacy: only Linear mapping is attempted.
   */
  target?: FormatTarget;
};

export const remarkCanonicalizeMixed: Plugin<[CanonicalizeOptions?], Root> = (
  opts?: CanonicalizeOptions
) => {
  const maps = opts?.maps ?? {};
  const target: FormatTarget | undefined = opts?.target;
  const linearUsers = maps.linear?.users ?? {};
  const slackUsers = maps.slack?.users ?? {};

  // Build case-insensitive lookup tables once per tree run
  const linearUsersLc: Record<string, { url: string; label?: string }> = {};
  for (const k of Object.keys(linearUsers)) {
    const v = linearUsers[k];
    if (v) linearUsersLc[k.toLowerCase()] = v;
  }
  const slackUsersLc: Record<string, { id: string; label?: string }> = {};
  for (const k of Object.keys(slackUsers)) {
    const v = slackUsers[k];
    if (v) slackUsersLc[k.toLowerCase()] = v;
  }
  const autolinks = opts?.autolinks ?? [];

  return (root: Root) => {
    // 0) Pre-pass: fix Slack-style autolinks that `remark-parse` mis-parses as a
    //    single link node whose URL contains a pipe. Example input:
    //      "<https://a.co|A>" → link { url: 'https://a.co|A', text: 'https://a.co|A' }
    //    We want a proper mdast link: url: 'https://a.co', children: [Text('A')]
    visit(root, 'link', (node: Link) => {
      const url = String(node.url ?? '');
      if (!url.includes('|')) return;
      // Only fix the specific mis-parse shape produced by remark for `<url|label>`:
      // a link whose single text child equals the URL string.
      if (
        node.children.length !== 1 ||
        node.children[0]?.type !== 'text' ||
        String(node.children[0].value ?? '') !== url
      ) {
        return;
      }
      // '|' is not valid in URLs; treat the first '|' as Slack label separator
      const parts = url.split('|', 2);
      const u = parts[0] ?? url;
      const labelRaw = parts[1];
      const label = (labelRaw ?? u).trim();
      node.url = u;
      node.title = null;
      node.children = [{ type: 'text', value: label }];
    });

    // 1) Block-level: '+++ Title' ... '+++' → details (with nesting)
    canonicalizeDetailsInParent(root);

    // 1.5) Convert Slack specials (and defensively, other Slack angle forms) that
    // were parsed as `html` nodes into canonical `mention` nodes so renderers can
    // handle them uniformly.
    visit(
      root,
      'html',
      (node: Html, index: number | undefined, parent: Parent | undefined) => {
        if (!parent || typeof index !== 'number') return;
        const v = String(node.value ?? '');

        // <!here>, <!channel>, <!everyone>
        let m = /^<!\s*(here|channel|everyone)\s*>$/.exec(v);
        if (m) {
          const mention: MentionNode = {
            type: 'mention',
            data: { subtype: 'special', id: m[1] },
            children: [],
          };
          parent.children.splice(index, 1, mention);
          return [CONTINUE, index + 1];
        }

        // Defensively handle Slack user/channel forms if they ever appear as `html`.
        // <@U123>
        m = /^<@([A-Z][A-Z0-9]+)>$/.exec(v);
        if (m) {
          const mention: MentionNode = {
            type: 'mention',
            data: { subtype: 'user', id: m[1] },
            children: [],
          };
          parent.children.splice(index, 1, mention);
          return [CONTINUE, index + 1];
        }
        // <@U123|label>
        m = /^<@([A-Z][A-Z0-9]+)\|([^>]+)>$/.exec(v);
        if (m) {
          const mention: MentionNode = {
            type: 'mention',
            data: { subtype: 'user', id: m[1], label: m[2] },
            children: [],
          };
          parent.children.splice(index, 1, mention);
          return [CONTINUE, index + 1];
        }
        // <#C123|label>
        m = /^<#([A-Z][A-Z0-9]+)\|([^>]+)>$/.exec(v);
        if (m) {
          const mention: MentionNode = {
            type: 'mention',
            data: { subtype: 'channel', id: m[1], label: m[2] },
            children: [],
          };
          parent.children.splice(index, 1, mention);
          return [CONTINUE, index + 1];
        }
        // <#C123>
        m = /^<#([A-Z][A-Z0-9]+)>$/.exec(v);
        if (m) {
          const mention: MentionNode = {
            type: 'mention',
            data: { subtype: 'channel', id: m[1] },
            children: [],
          };
          parent.children.splice(index, 1, mention);
          return [CONTINUE, index + 1];
        }
      }
    );

    // 2) Inline text normalization
    visit(
      root,
      'text',
      (node: Text, index: number | undefined, parent: Parent | undefined) => {
        if (!parent || isCodeLike(parent)) return;

        const fragments: PhrasingContent[] = [];
        const input = String(node.value ?? '')
          // Normalize HTML-escaped Slack specials that may appear in plain text.
          .replace(/&lt;!(here|channel|everyone)&gt;/g, '<!$1>');
        let lastIndex = 0;
        let sawAnyMatch = false;

        // Composite regex covering several constructs; we will branch inside the loop
        const re =
          /~([^~\s][^~]*?)~|<(?:(?:@([A-Z][A-Z0-9]+)(?:\|([^>]+))?)|#([A-Z][A-Z0-9]+)(?:\|([^>]+))?|!((?:here|channel|everyone))|([^>|]+?)(?:\|([^>]*))?)>|@([a-zA-Z0-9._-]+)/g;
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(input))) {
          if (m.index === lastIndex && m[0] === '') break; // safety for trailing |
          sawAnyMatch = true;
          if (m.index > lastIndex) {
            fragments.push({
              type: 'text',
              value: input.slice(lastIndex, m.index),
            });
          }
          const [whole] = m;

          if (m[1]) {
            // ~strike~
            fragments.push({
              type: 'delete',
              children: [{ type: 'text', value: m[1] }],
            });
          } else if (m[2]) {
            // <@U123> or <@U123|label>
            const mention: MentionNode = {
              type: 'mention',
              data: { subtype: 'user', id: m[2], label: m[3] },
              children: [],
            };
            fragments.push(mention);
          } else if (m[4]) {
            // <#C123> or <#C123|name>
            const mention: MentionNode = {
              type: 'mention',
              data: { subtype: 'channel', id: m[4], label: m[5] },
              children: [],
            };
            fragments.push(mention);
          } else if (m[6]) {
            // <!here> / <!channel> / <!everyone>
            const mention: MentionNode = {
              type: 'mention',
              data: { subtype: 'special', id: m[6] },
              children: [],
            };
            fragments.push(mention);
          } else if (m[7]) {
            // <url|label?> or <url>
            const url = m[7];
            const label = m[8] ?? m[7];
            fragments.push({
              type: 'link',
              url,
              title: null,
              children: [{ type: 'text', value: label }],
            });
          } else if (m[9]) {
            // @user (target-aware mapping; case-insensitive)
            const key = m[9];
            const keyLc = key.toLowerCase();
            if (target === 'slack') {
              const sHit = slackUsersLc[keyLc];
              if (sHit?.id) {
                const mention: MentionNode = {
                  type: 'mention',
                  data: { subtype: 'user', id: sHit.id },
                  children: [],
                };
                fragments.push(mention);
              } else {
                fragments.push({ type: 'text', value: whole });
              }
            } else {
              const lHit = linearUsersLc[keyLc];
              if (lHit?.url) {
                fragments.push({
                  type: 'link',
                  url: lHit.url,
                  title: null,
                  children: [{ type: 'text', value: lHit.label ?? `@${key}` }],
                });
              } else {
                fragments.push({ type: 'text', value: whole });
              }
            }
          }
          lastIndex = re.lastIndex;
        }
        // Append remaining tail after the last match so trailing text is preserved
        if (sawAnyMatch && lastIndex < input.length) {
          fragments.push({ type: 'text', value: input.slice(lastIndex) });
        }

        // Note: autolinks are applied in a dedicated second pass below.
        if (
          fragments.length &&
          parent &&
          Array.isArray(parent.children) &&
          typeof index === 'number'
        ) {
          parent.children.splice(index, 1, ...fragments);
        }
      }
    );

    // 3) Second pass: apply autolinks inside plain text fragments only (skip inside existing links)
    if (autolinks.length > 0) {
      visit(root, 'text', (node: Text, index, parent) => {
        if (!parent || typeof index !== 'number') return;
        // do not modify labels of existing links or reference-style links
        if (parent.type === 'link' || parent.type === 'linkReference') {
          return;
        }
        const input = String(node.value ?? '');
        let parts: PhrasingContent[] = [{ type: 'text', value: input }];
        for (const rule of autolinks) {
          // Clone once per rule and reset between segments to avoid `lastIndex` bleed
          const baseFlags = rule.pattern.flags;
          const flags = baseFlags.includes('g') ? baseFlags : baseFlags + 'g';
          const re = new RegExp(rule.pattern.source, flags);
          const next: PhrasingContent[] = [];
          for (const seg of parts) {
            if (seg.type !== 'text') {
              next.push(seg);
              continue;
            }
            const tmp: PhrasingContent[] = [];
            re.lastIndex = 0;
            splitInclusive(
              String(seg.value ?? ''),
              re,
              (mm) => {
                const url = templ(rule.urlTemplate, mm);
                const label = templ(rule.labelTemplate ?? '$0', mm) || mm[0];
                return {
                  type: 'link',
                  url,
                  title: null,
                  children: [{ type: 'text', value: label }],
                };
              },
              tmp
            );
            next.push(...tmp);
          }
          parts = next;
        }
        // No-op when nothing changed to avoid churn and re-visits
        if (
          parts.length === 1 &&
          parts[0]?.type === 'text' &&
          parts[0]?.value === input
        ) {
          return;
        }
        parent.children.splice(index, 1, ...parts);
        // Continue after the inserted range to avoid revisiting freshly-added nodes
        return [CONTINUE, index + parts.length];
      });
    }

    // 4) Normalize bare task markers in list items with no inline content.
    // Remark only sets `listItem.checked` when there is content after the
    // marker (e.g., "- [x] done"). For inputs like "- [x]" or "- [ ]" with
    // no content, the marker is parsed as plain text ("[x]"/"[ ]") and later
    // stringifiers escape it to "\[x]". Promote these to actual task list
    // items so GitHub/Linear renderers emit "- [x]" / "- [ ]" as intended.
    visit(root, 'listItem', (li) => {
      if (!isListItemNode(li)) return;
      // Only consider items that are not already tasks
      if (typeof li.checked === 'boolean') return;
      if (!Array.isArray(li.children) || li.children.length === 0) return;
      const first = li.children[0];
      if (!first || first.type !== 'paragraph') return;
      // Tight match: a single text child that equals "[x]" or "[ ]" (allowing surrounding whitespace)
      if (first.children.length === 1) {
        const onlyChild = first.children[0];
        if (onlyChild && onlyChild.type === 'text') {
          const raw = String(onlyChild.value ?? '');
          const m = /^\s*\[(x|X| )\]\s*$/.exec(raw);
          if (m) {
            // Mark as a task and drop the marker paragraph (no inline content)
            const flag = String(m[1] ?? '').toLowerCase();
            li.checked = flag === 'x';
            li.children.splice(0, 1);
          }
        }
      }
    });
  };
};

function hasTypeField(v: unknown): v is { type: unknown } {
  return typeof v === 'object' && v !== null && 'type' in v;
}

function isListItemNode(node: unknown): node is ListItem {
  if (!hasTypeField(node)) return false;
  return typeof node.type === 'string' && node.type === 'listItem';
}

function canonicalizeDetailsInParent(parent: Parent): void {
  for (let i = 0; i < parent.children.length; i++) {
    const node = parent.children[i];
    if (!node || node.type !== 'paragraph') continue;
    const p = node;
    if (p.children.length !== 1 || p.children[0]?.type !== 'text') continue;
    const first = p.children[0];
    const text = String(first.value ?? '');
    const open = /^\+\+\+\s+(.+)/.exec(text);
    if (!open) continue;

    const title = (open[1] || '').trim();
    let j = i + 1;
    let depth = 1; // already saw one opener
    // Scan forward to find the matching closing fence, tracking nesting
    for (; j < parent.children.length; j++) {
      const n = parent.children[j];
      if (!n || n.type !== 'paragraph') continue;
      const only = n.children.length === 1 ? n.children[0] : null;
      const t = only?.type === 'text' ? String(only.value ?? '') : '';
      if (!t) continue;
      if (/^\+\+\+\s*$/.test(t)) {
        depth--;
        if (depth === 0) break; // found matching close for our opener
        continue;
      }
      const innerOpen = /^\+\+\+\s+(.+)/.exec(t);
      if (innerOpen) {
        depth++;
      }
    }

    // If no matching closing fence found, leave as plain text
    if (j >= parent.children.length) continue;

    // Collect body nodes between i+1 and j-1 (inclusive)
    const body = parent.children.slice(i + 1, j);
    // Remove opener..closer range and replace with details node
    const details: DetailsNode = {
      type: 'details',
      data: { summary: title },
      children: body,
    };
    parent.children.splice(i, j - i + 1, details);

    // Recursively canonicalize nested openers inside the new details body
    canonicalizeDetailsInParent(details);

    // Continue after the inserted node
  }
}

function isCodeLike(_node: Parent): boolean {
  // Text nodes never appear under `code`/`inlineCode` (they are Literals),
  // so this is effectively a no-op guard to mirror previous behavior.
  return false;
}

function templ(tpl: string, m: RegExpExecArray): string {
  return tpl.replace(/\$(\d+)/g, (_, g1) => m[Number(g1)] ?? '');
}

function splitInclusive(
  input: string,
  re: RegExp,
  toNode: (m: RegExpExecArray) => PhrasingContent | null,
  out: PhrasingContent[]
): string {
  let last = 0;
  re.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input))) {
    if (match.index > last) {
      out.push({ type: 'text', value: input.slice(last, match.index) });
    }
    const node = toNode(match);
    out.push(node ?? { type: 'text', value: match[0] });
    last = re.lastIndex;
  }
  const tail = input.slice(last);
  if (tail) {
    out.push({ type: 'text', value: tail });
  }
  return '';
}
