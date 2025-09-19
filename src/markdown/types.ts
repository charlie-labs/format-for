import {
  type Content,
  type Data,
  type Parent as MdastParent,
  type PhrasingContent,
  type Root,
} from 'mdast';

export type FormatTarget = 'github' | 'slack' | 'linear';

/**
 * Rule to autolink patterns (like GitHub autolinks).
 * Use RegExp with global flag; $0..$n allowed in templates.
 */
export interface AutoLinkRule {
  pattern: RegExp;
  urlTemplate: string; // e.g., 'https://linear.app/charlie/issue/$0'
  labelTemplate?: string; // default: '$0'
}

/** Maps for static, in-memory mention resolution (no async). */
export interface MentionMaps {
  slack?: {
    /** '@riley' -> { id: 'U123', label: 'Riley' } */
    users?: Record<string, { id: string; label?: string }>;
    /** 'dev' -> { id: 'C123', label: '#dev' } */
    channels?: Record<string, { id: string; label?: string }>;
  };
  linear?: {
    /** 'riley' -> { url: 'https://linear.app/.../riley', label?: 'Riley' } */
    users?: Record<string, { url: string; label?: string }>;
  };
}

/** Options for formatting. All synchronous. */
export interface FormatOptions {
  maps?: MentionMaps;
  /** Autolink rules for Linear (and optionally others in future). */
  autolinks?: { linear?: AutoLinkRule[] };
  /** Allowed HTML tags for Linear; others are stripped. Defaults to ['details','summary','u','sub','sup','br'] */
  linearHtmlAllow?: ('details' | 'summary' | 'u' | 'sub' | 'sup' | 'br')[];
}

/**
 * Main entry point: return just the rendered string.
 * Degradations print to console.warn (best effort).
 * @param input mixed Slack/Linear/GFM
 * @param target 'github' | 'slack' | 'linear'
 * @param options maps/autolinks/allowlist
 */
export type FormatFor = (
  input: string,
  target: FormatTarget,
  options?: FormatOptions
) => Promise<string>;

// ——— mdast custom nodes (first‑class, typed) ———

// Mention node used by the canonicalizer (Slack-style mentions, plus specials)
export interface MentionNode extends MdastParent {
  type: 'mention';
  // We keep data small and predictable; all values are optional at parse time
  data?: Data & {
    subtype: 'user' | 'channel' | 'special';
    id?: string;
    label?: string;
  };
  // Mentions are phrasing content; children are rarely used but allowed
  children: PhrasingContent[];
}

// Details node that models GitHub <details> / Linear +++ blocks
export interface DetailsNode extends MdastParent {
  type: 'details';
  data?: Data & { summary?: string };
  children: Content[];
}

// Module augmentation so `mention`/`details` participate in mdast unions
declare module 'mdast' {
  interface PhrasingContentMap {
    mention: MentionNode;
  }
  interface BlockContentMap {
    details: DetailsNode;
  }
  interface RootContentMap {
    mention: MentionNode;
    details: DetailsNode;
  }
}

// Small, centrally-defined unions/guards used across files
export type InlineNode = PhrasingContent; // includes our `mention` via augmentation

export function isRoot(node: unknown): node is Root {
  const n = node as { type?: unknown; children?: unknown };
  return !!n && n.type === 'root' && Array.isArray(n.children);
}

export function assertIsRoot(node: unknown): asserts node is Root {
  if (!isRoot(node)) throw new Error('Expected mdast Root');
}
