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

// Central source of truth for Linear's supported inline HTML tags.
// Keep this list in lockstep with what Linear renders today.
export const DEFAULT_LINEAR_HTML_ALLOW = [
  'details',
  'summary',
  'u',
  'sub',
  'sup',
  'br',
] as const;

export type LinearAllowedHtmlTag = (typeof DEFAULT_LINEAR_HTML_ALLOW)[number];

/** Options for formatting. All synchronous. */
export interface FormatOptions {
  maps?: MentionMaps;
  /** Autolink rules for Linear (and optionally others in future). */
  autolinks?: { linear?: AutoLinkRule[] };
  // Note: Linear's HTML allowlist is intentionally NOT configurable by callers.
}

/** Function signature for a target-specific formatter. */
export type FormatFn = (
  input: string,
  options?: FormatOptions
) => Promise<string>;

/**
 * Public API surface.
 *
 * Usage:
 *   await formatFor.github(markdown, opts)
 *   await formatFor.slack(markdown, opts)
 *   await formatFor.linear(markdown, opts)
 */
export interface FormatFor {
  github: FormatFn;
  slack: FormatFn;
  linear: FormatFn;
}

// Optional runtime defaults provider injected via a factory. This lets apps
// plug in environment/network-backed loaders without hard-wiring any globals
// into the library. Providers may cache internally; callers control tenancy
// by choosing when/how they construct the formatter.
export type DefaultsProvider = {
  /** Ensure defaults needed for a specific target are available (may fetch/cache). */
  ensureFor(target: FormatTarget): Promise<void>;
  /** Return a readonly snapshot of defaults to merge into per-call options. */
  snapshot(): Readonly<Partial<Pick<FormatOptions, 'maps' | 'autolinks'>>>;
};

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isRoot(node: unknown): node is Root {
  if (!isRecord(node)) return false;
  const typeVal = node['type'];
  const childrenVal = node['children'];
  return typeVal === 'root' && Array.isArray(childrenVal);
}

export function assertIsRoot(node: unknown): asserts node is Root {
  if (!isRoot(node)) throw new Error('Expected mdast Root');
}
