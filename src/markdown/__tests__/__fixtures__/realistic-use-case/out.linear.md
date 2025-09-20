# Project Alpha: Auth flow update (fixture input)

Short summary: We are migrating the auth callback. FYI  see [auth-discussion](https://charlie-labs.slack.com/archives/C12345/p1726800000000). Ping @user and #ops. Old flow ~~deprecated~~.

+++ Decisions

- Keep email-first login; remove ~~magic-link-only~~ path.
- Links: Markdown [spec](https://spec.commonmark.org) and Slack form [Docs](https://example.com).
- Include a bare URL too: <https://example.org>.

+++ Edge cases

- Safari ITP and cookies.
- If user is SSO-only, show a link back.
- Mention special  to alert during rollout.

+++

- Table and images should still render cross-platform.

+++

## Tasks

1. Backend
   - Add POST /v2/auth/verify
     - Increase rate limit from 30 to 60
2. Frontend
   - Update callback handler
   - Add retry UI

> Note: rollout starts Monday. Coordinate with #release and @riley.

### Code sample

```ts
// `+++` inside code should NOT create a details block.
export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}
```

### Cases

| Case        | Expected |
| ----------- | -------- |
| Valid email | 200      |
| Bad token   | 401      |

![diagram](https://example.com/flow.png)

HTML allowed tags: \<u>\</u>Important and \<sup>\</sup>2.\<br>
HTML disallowed inline in a paragraph (to exercise Linear's allowlist):&#x20;

Standalone HTML block that should be stripped on Slack/Linear

Footnote ref[^1].

[^1]: This is a footnote with a Slack user @user and a Slack link [ex](https://ex.com).

