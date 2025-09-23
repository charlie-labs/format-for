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
 * The library will normalize provided RegExp patterns to be global
 * (add the 'g' flag when missing) to avoid lastIndex bleed and to make
 * replacement passes reliable. $0..$n are allowed in templates.
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
  /**
   * Autolink rules grouped by target. During provider/caller merge, rules are combined per-target.
   * At parse time, all rules are flattened and applied target-agnostically to the canonical AST.
   * This means callers can place rules under any key, but keys primarily exist to control merge semantics.
   */
  autolinks?: Partial<Record<FormatTarget, AutoLinkRule[]>>;

  // Centralized renderer warnings behavior (v1 surface)
  warnings?: {
    /** default: 'console' */
    mode?: 'console' | 'silent';
    /** Always invoked with the warning message when provided. */
    onWarn?: (message: string) => void;
  };

  // Target-scoped knobs (v1)
  target?: {
    slack?: {
      lists?: { maxDepth?: number }; // default: 2
      images?: { style?: 'link' | 'url'; emptyAltLabel?: string }; // default: 'link' + 'image'
    };
    github?: {
      breaks?: 'two-spaces' | 'backslash'; // default: 'two-spaces'
    };
    // NOTE(vNext): Linear options are intentionally not exposed in v1
  };
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
