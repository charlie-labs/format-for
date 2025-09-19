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
