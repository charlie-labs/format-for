# format-for

[![CI](https://github.com/charlie-labs/format-for/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/charlie-labs/format-for/actions/workflows/ci.yml)
[![Bun](https://img.shields.io/badge/bun-1.x-000)](https://bun.sh)

One Markdown input → clean output for GitHub, Slack, or Linear.

You don’t need to know the input’s dialect. Pass Markdown that might mix Linear fences, Slack `<url|label>` links/mentions, and GFM. format‑for parses once and renders target‑aware output with predictable, safe degradations and explicit warnings.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Example: one input → three outputs](#example-one-input--three-outputs)
- [Concepts](#concepts)
- [API](#api)
- [Target behavior highlights](#target-behavior-highlights)
- [Recipes](#recipes)
- [Warnings and safety](#warnings-and-safety)
- [Performance and idempotency](#performance-and-idempotency)
- [Contributing](#contributing)
- [License](#license)

## Install

This package is ESM‑first with a CJS fallback and works in Bun or Node.

```bash
bun add format-for
# or
npm i format-for
# or
yarn add format-for
# or
pnpm add format-for
```

## Quick start

```ts
import { formatFor } from 'format-for';

const md = `
+++ Summary

Collapsible content

+++

See @riley in #dev and <https://example.com|site>.
`;

const gh = await formatFor.github(md);
const slack = await formatFor.slack(md);
const linear = await formatFor.linear(md);
```

Outputs for the snippet above (exact values):

GitHub

```md
<details>
<summary>Summary</summary>

Collapsible content

</details>

See @riley in #dev and [site](https://example.com).
```

Slack

```
*Summary*
> Collapsible content
See @riley in #dev and <https://example.com|site>.
```

Linear

```md
+++ Summary

Collapsible content

+++

See @riley in #dev and [site](https://example.com).
```

Prefer to inject live Slack/Linear defaults (real users/channels, org/team autolinks)? Use the factory:

```ts
import { createFormatFor, createEnvDefaultsProvider } from 'format-for';

const ff = createFormatFor({
  defaults: createEnvDefaultsProvider({
    // optional: override cache namespace and token/TTL; when not provided,
    // SLACK_BOT_TOKEN and LINEAR_API_KEY env vars are used by default
    // namespace: 'my-app:format-for:v1',
    // slack: { token: 'xoxb-…', ttlMs: 10 * 60_000 },
    // linear: { apiKey: 'lin_api_…', ttlMs: 60 * 60_000 },
  }),
});

const out = await ff.slack('Ping @riley in #dev');
```

## Example: one input → three outputs

Below is a realistic mixed‑syntax input (taken from our test fixtures), followed by the exact strings returned for each target.

<details>
<summary><strong>Input (Markdown, mixed Slack/Linear/GFM)</strong></summary>

````md
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
````

</details>

<details>
<summary><strong>GitHub output (exact value)</strong></summary>

````md
# Project Alpha: Auth flow update (fixture input)

Short summary: We are migrating the auth callback. FYI @here see [auth-discussion](https://charlie-labs.slack.com/archives/C12345/p1726800000000). Ping @U02AAAAAA and #ops. Old flow ~~deprecated~~.

<details>
<summary>Decisions</summary>

- Keep email-first login; remove ~~magic-link-only~~ path.
- Links: Markdown [spec](https://spec.commonmark.org) and Slack form [Docs](https://example.com).
- Include a bare URL too: <https://example.org>.

<details>
<summary>Edge cases</summary>

- Safari ITP and cookies.
- If user is SSO-only, show a link back.
- Mention special @channel to alert during rollout.
</details>

- Table and images should still render cross-platform.
</details>

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

[^1]: This is a footnote with a Slack user @U0FOOT and a Slack link [ex](https://ex.com).
````

</details>

<details>
<summary><strong>Linear output (exact value)</strong></summary>

````md
# Project Alpha: Auth flow update (fixture input)

Short summary: We are migrating the auth callback. FYI @here see [auth-discussion](https://charlie-labs.slack.com/archives/C12345/p1726800000000). Ping @U02AAAAAA and #ops. Old flow ~~deprecated~~.

+++ Decisions

- Keep email-first login; remove ~~magic-link-only~~ path.
- Links: Markdown [spec](https://spec.commonmark.org) and Slack form [Docs](https://example.com).
- Include a bare URL too: <https://example.org>.

+++ Edge cases

- Safari ITP and cookies.
- If user is SSO-only, show a link back.
- Mention special @channel to alert during rollout.

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
HTML disallowed inline in a paragraph (to exercise Linear's allowlist):

Footnote ref[^1].

[^1]: This is a footnote with a Slack user @U0FOOT and a Slack link [ex](https://ex.com).
````

</details>

<details>
<summary><strong>Slack output (exact value)</strong></summary>

````

_Project Alpha: Auth flow update (fixture input)_

Short summary: We are migrating the auth callback. FYI <!here> see <https://charlie-labs.slack.com/archives/C12345/p1726800000000|auth-discussion>. Ping <@U02AAAAAA> and <#C02OPS|ops>. Old flow ~deprecated~.

_Decisions_

> • Keep email-first login; remove ~magic-link-only~ path.
> • Links: Markdown <https://spec.commonmark.org|spec> and Slack form <https://example.com|Docs>.
> • Include a bare URL too: <https://example.org|https://example.org>.
>
> _Edge cases_
>
> > • Safari ITP and cookies.
> > • If user is SSO-only, show a link back.
> > • Mention special <!channel> to alert during rollout.
> > • Table and images should still render cross-platform.
> > _Tasks_

1. Backend
   • Add POST /v2/auth/verify
   → Increase rate limit from 30 to 60

2. Frontend
   • Update callback handler
   • Add retry UI

> Note: rollout starts Monday. Coordinate with #release and @riley.

_Code sample_

```
// `+++` inside code should NOT create a details block.
export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}
```

_Cases_

```
Case | Expected
Valid email | 200
Bad token | 401
```

<https://example.com/flow.png|diagram>

HTML allowed tags: &lt;u&gt;Important&lt;/u&gt; and &lt;sup&gt;2&lt;/sup&gt;.&lt;br&gt;
HTML disallowed inline in a paragraph (to exercise Linear's allowlist): &lt;video src="/noop"&gt;&lt;/video&gt;

Footnote ref^[1].

Footnotes:
[1] This is a footnote with a Slack user <@U0FOOT> and a Slack link <https://ex.com|ex>.

````

</details>

## Concepts

- Parse once → canonical mdast → render per‑target.
- Predictable degradations with explicit warnings (e.g., Slack tables → code blocks; math → code; images → links; Linear strips disallowed HTML).
- Idempotent output per target; code/inline code is never changed by autolinks or formatting.
- Autolinks and mentions are deterministic and local by default; optional env‑backed defaults provider hydrates Slack users/channels and Linear org/team/user data when tokens are present.

## API

### `formatFor`

- `formatFor.github(input, options?)`
- `formatFor.slack(input, options?)`
- `formatFor.linear(input, options?)`

Each returns a `Promise<string>` with the formatted value for that target.

### Factory and env defaults

```ts
import { createFormatFor, createEnvDefaultsProvider } from 'format-for';

const ff = createFormatFor({
  defaults: createEnvDefaultsProvider({
    // optional: override token/TTL/namespace; env fallbacks used by default
    // slack: { token: 'xoxb-…', ttlMs: 10 * 60_000 },
    // linear: { apiKey: 'lin_api_…', ttlMs: 60 * 60_000 },
  }),
});

const out = await ff.github('Ref ENG-123 and say hi to @riley');
```

### FormatOptions (v1)

```ts
type FormatOptions = {
  maps?: {
    slack?: {
      users?: Record<string, { id: string; label?: string }>;
      channels?: Record<string, { id: string; label?: string }>;
    };
    linear?: { users?: Record<string, { url: string; label?: string }> };
  };
  autolinks?: Partial<
    Record<
      'github' | 'slack' | 'linear',
      Array<{
        pattern: RegExp;
        urlTemplate: string;
        labelTemplate?: string;
      }>
    >
  >;
  warnings?: {
    mode?: 'console' | 'silent';
    onWarn?: (message: string) => void;
  };
  target?: {
    slack?: {
      lists?: { maxDepth?: number }; // default: 2
      images?: { style?: 'link' | 'url'; emptyAltLabel?: string }; // defaults: style 'link'; emptyAltLabel 'image'
    };
    github?: { breaks?: 'two-spaces' | 'backslash' }; // default: 'two-spaces'
    // Linear options are intentionally not exposed in v1
  };
};
```

Notes

- Autolinks are normalized to global regex; when provider + caller rules collide, the caller wins.
- Linear’s HTML allowlist is fixed internally: `details`, `summary`, `u`, `sub`, `sup`, `br`.

## Target behavior highlights

- GitHub
  - `details` nodes render as `<details><summary>…</summary>…</details>` HTML.
  - Hard breaks use two spaces by default (configurable to backslash).
  - Preserves task list state on bare marker lines.
- Slack
  - Headings become bold lines; quotes have readable spacing.
  - Lists deeper than `maxDepth` flatten with a single warning per render.
  - Images emit as `<url|label>` links (or bare URLs) with a warning; style is configurable.
  - Tables → fenced code with a warning; inline/display math → code/code blocks with warnings.
  - Footnotes become `^[n]` plus appended refs; all HTML stripped with a warning.
- Linear
  - `+++ Summary` → collapsible; disallowed HTML is stripped while keeping surrounding text.
  - Slack/Linear mentions normalize to links/plain text as appropriate.

## Recipes

- Autolink Linear issues (multiple team keys):

  ```ts
  const rules = [
    {
      pattern: /\b(BOT-\d+)\b/g,
      urlTemplate: 'https://linear.app/charlie/issue/$0',
    },
    {
      pattern: /\b(ENG-\d+)\b/g,
      urlTemplate: 'https://linear.app/charlie/issue/$0',
    },
  ];
  await formatFor.github(text, {
    autolinks: { github: rules, linear: rules, slack: rules },
  });
  ```

- Route warnings to your logger and silence console output:

  ```ts
  await formatFor.slack(md, {
    warnings: { mode: 'silent', onWarn: (m) => log.warn(m) },
  });
  ```

- Preserve GitHub backslash hard breaks:

  ```ts
  await formatFor.github(md, { target: { github: { breaks: 'backslash' } } });
  ```

- Use live Slack/Linear defaults (if tokens exist):

  ```ts
  const ff = createFormatFor({ defaults: createEnvDefaultsProvider() });
  const text = await ff.slack('See @riley in #dev');
  ```

## Warnings and safety

- Slack: HTML stripped; images/tables/math/footnotes degrade with clear warnings; link labels are sanitized.
- Linear: strict inline HTML allowlist; disallowed tags are removed and paragraphs preserved; warnings are emitted.
- Code blocks and inline code are never altered by autolinks or formatting passes.

Control warnings with `warnings.mode` and `warnings.onWarn`.

## Performance and idempotency

- One parse; lightweight renderers; no network calls unless you opt in via the factory.
- Formatting is idempotent for a given target (running twice yields the same string).

## Contributing

Dev commands:

```bash
bun install
bun run typecheck
bun run lint
bun run test
```

Fixtures live under `src/markdown/__tests__/__fixtures__/`. To regenerate example outputs locally, run: `bun scripts/gen-fixtures.ts`.

## License

[MIT](./LICENSE)
