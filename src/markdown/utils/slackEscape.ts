export function slackEscape(input: string): string {
  // Slack mrkdwn requires escaping of &, <, >
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
