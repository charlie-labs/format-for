export type FormatTarget = 'github' | 'slack' | 'linear';

export interface AutoLinkRule {
  pattern: RegExp;
  urlTemplate: string;
  labelTemplate?: string;
}

export interface MentionMaps {
  slack?: {
    users?: Record<string, { id: string; label?: string }>;
    channels?: Record<string, { id: string; label?: string }>;
  };
  linear?: {
    users?: Record<string, { url: string; label?: string }>;
  };
}

export interface FormatOptions {
  maps?: MentionMaps;
  autolinks?: { linear?: AutoLinkRule[] };
  linearHtmlAllow?: ('details' | 'summary' | 'u' | 'sub' | 'sup' | 'br')[];
}

export type FormatFor = (
  input: string,
  target: FormatTarget,
  options?: FormatOptions
) => Promise<string>;
