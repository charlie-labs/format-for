# Project Alpha: Auth flow update (fixture input)

Short summary: We are migrating the auth callback. FYI <!here> see <https://charlie-labs.slack.com/archives/C12345/p1726800000000|auth-discussion>. Ping <@U02AAAAAA> and <#C02OPS|ops>. Old flow ~deprecated~.

+++ Decisions

- Keep email-first login; remove ~magic-link-only~ path.
- Links: Markdown [spec](https://spec.commonmark.org) and Slack form <https://example.com|Docs>.
- Include a bare URL too: <https://example.org>.

+++ Edge cases

- Safari ITP and cookies.
- If user is SSO-only, show a link back.
- Mention special <!channel> to alert during rollout.

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

HTML allowed tags: <u>Important</u> and <sup>2</sup>.<br>
HTML disallowed inline in a paragraph (to exercise Linear's allowlist): <video src="/noop"></video>

<div>Standalone HTML block that should be stripped on Slack/Linear</div>

Footnote ref[^1].

[^1]: This is a footnote with a Slack user <@U0FOOT> and a Slack link <https://ex.com|ex>.
