<div align="center">

# format-for

[![CI](https://github.com/charlie-labs/format-for/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/charlie-labs/format-for/actions/workflows/ci.yml)
[![Bun](https://img.shields.io/badge/bun-1.x-000)](https://bun.sh)

One Markdown string in; safe, consistent output for GitHub, Slack, and Linear.

</div>

`format-for` lets you author in plain Markdown (GFM), accept mixed input (Slack angle links/mentions, Linear `+++` collapsibles), and render a best-effort version for each target surface. When something must be downgraded (e.g., tables in Slack), it prints a clear `console.warn` so you can see what changed.

The original motivation and behavior goals are captured in [issue #2](https://github.com/charlie-labs/format-for/issues/2). This README documents the current implementation.

---

## Install

This repository is currently private and not published to npm. Use it from a workspace or install directly from GitHub if you have access.

```bash
# Workspace (recommended)
# package.json → "dependencies": { "format-for": "file:../format-for" }

# Or via GitHub (requires token with repo read access)
 bun add github:charlie-labs/format-for
```

Runtime: Bun 1.x or Node 18+. Module format: ESM.

---

## Quick start

```ts
import { formatFor } from 'format-for';

const input = `# Title\n\nPing <@U12345> and <!here>. See <https://example.com|Docs>.\n\n+++ Decisions\n- Use GFM\n- Keep email-first\n+++\n`;

// GitHub (GFM + <details>)
const gh = await formatFor(input, 'github');

// Slack (mrkdwn)
const sl = await formatFor(input, 'slack'); // prints warnings for downgrades

// Linear (GFM-ish + HTML allowlist + '+++' collapsibles)
const li = await formatFor(input, 'linear', {
  autolinks: {
    linear: [
      { pattern: /BOT-(\d+)/g, urlTemplate: 'https://linear.app/issue/BOT-$1' },
    ],
  },
  maps: {
    linear: {
      users: {
        riley: {
          url: 'https://linear.app/charlie/profiles/riley',
          label: 'Riley',
        },
      },
    },
  },
  // Defaults: ['details','summary','u','sub','sup','br']
  linearHtmlAllow: ['details', 'summary', 'u', 'sub', 'sup', 'br'],
});
```

---

## What it does

- Parses mixed Slack/Linear/GFM into a canonical Markdown AST.
- Normalizes common Slack forms and Linear syntax:
  - `<https://url|label>` → a proper Markdown link
  - `<@U…>`, `<#C…|name>`, `<!here>` → typed “mention” nodes in the AST
  - `+++ Title … +++` → collapsible “details” blocks
  - `@riley` (Linear) → link, when mapped
  - Custom autolinks like `BOT-123` → link, when configured
- Renders per surface:
  - GitHub: standard GFM; collapsibles as `<details><summary>…` blocks
  - Slack: mrkdwn with safe downgrades
    - headings → bold lines
    - tables → fenced code blocks (warn)
    - images → links (warn)
    - deep lists (>2) → flattened with `→` prefix (warn)
    - HTML → stripped (warn)
  - Linear: GFM with a strict HTML allowlist
    - collapsibles as `+++ Title` fences
    - HTML not in the allowlist → stripped; if it appears inline in a paragraph, the whole paragraph is removed (warn)

Guarantees backed by tests:

- Code spans/blocks are never modified.
- Idempotent for supported constructs per target.
- Warns on every degradation Slack/Linear make relative to Markdown.

---

## Examples

The snippets below come from the [realistic-use-case fixture](./src/markdown/__tests__/__fixtures__/realistic-use-case/input.md).

<details>
<summary><strong>Input (excerpt)</strong></summary>

```md
Short summary: We are migrating the auth callback. FYI <!here> see <https://charlie-labs.slack.com/archives/C12345/p1726800000000|auth-discussion>. Ping <@U02AAAAAA> and <#C02OPS|ops>. Old flow ~deprecated~.

+++ Decisions

- Keep email-first login; remove ~magic-link-only~ path.
- Links: Markdown [spec](https://spec.commonmark.org) and Slack form <https://example.com|Docs>.
- Include a bare URL too: <https://example.org>.

+++ Edge cases

- Safari ITP and cookies.
- Mention special <!channel> to alert during rollout.

+++

| Case        | Expected |
| ----------- | -------- |
| Valid email | 200      |
| Bad token   | 401      |
```

</details>

<details>
<summary><strong>Slack (mrkdwn) — key differences</strong></summary>

- Headings are printed as bold lines
- The nested `+++` section is rendered as a bold summary followed by an indented quote block
- The table renders as a fenced code block
- Warnings printed for this input: `Slack: flattened list depth > 2`, `Slack: table downgraded to code block`, `Slack: HTML stripped`

</details>

<details>
<summary><strong>GitHub (GFM)</strong></summary>

- `+++` becomes a `<details><summary>…</summary>…</details>` block (including nested details)
- Slack mentions render as plain text like `@U02AAAAAA`, `#ops`, `@everyone`

</details>

<details>
<summary><strong>Linear</strong></summary>

- `+++ Title` blocks are preserved
- HTML is allowed only for: `details`, `summary`, `u`, `sub`, `sup`, `br` (configurable); anything else is stripped and, if inline within a paragraph, the entire paragraph is removed

</details>

---

## API

```ts
import { formatFor } from 'format-for';

type Target = 'github' | 'slack' | 'linear';

const out = await formatFor(input, target, {
  maps: {
    // Resolve Linear @user → URL in labels like "@riley"
    linear: {
      users: { riley: { url: 'https://linear.app/.../riley', label: 'Riley' } },
    },
  },
  autolinks: {
    // Turn BOT-123 into a link; label defaults to $0 when not provided
    linear: [
      { pattern: /BOT-(\d+)/g, urlTemplate: 'https://linear.app/issue/BOT-$1' },
    ],
  },
  linearHtmlAllow: ['details', 'summary', 'u', 'sub', 'sup', 'br'],
});
```

Notes:

- The function is `async` but runs synchronously today; it returns a `Promise<string>` by design.
- Degradations are reported via `console.warn` (strings like `Slack: …` or `Linear: …`).

---

## Behavior reference (short)

- GitHub: GFM + `<details>`; Slack/Linear mentions are printed as plain text.
- Slack: mrkdwn printer; strips HTML; tables/images/lists are downgraded with warnings.
- Linear: GFM with HTML allowlist; collapsibles via `+++`; Slack angle mentions are emitted as plain text unless you map users to URLs.

See tests for the exact strings per surface.

---

## Development

```bash
bun install

# Run the full verifier locally
bun run typecheck
bun run lint
bun run test
```

Tests are the spec. Fixture outputs live under `src/markdown/__tests__/__fixtures__/*` and are checked character-for-character. Coverage gates are enforced for the renderers.

---

## License

UNLICENSED (private repository)
