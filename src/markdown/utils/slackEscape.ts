/**
 * Escape Slack text: &, <, >
 * Call this on plain text segments only (never inside code or link labels that will be printed raw).
 */
export function escapeSlackText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
