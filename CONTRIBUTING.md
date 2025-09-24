# Contributing to format-for

Thanks for taking the time to contribute. This project is Bun‑first, ESM‑only, and keeps things simple. Small, focused PRs are easiest to review and ship.

## Quick start

Prereqs

- Bun 1.2+ (preferred)
- Node.js 22+ (supported; mainly used in CI/publishing)

Clone and set up:

```bash
git clone https://github.com/charlie-labs/format-for.git
cd format-for
bun install
```

Build (optional for local dev):

```bash
bun run build
```

Run checks:

```bash
bun run typecheck
bun run lint
bun run test
# or everything: runs typecheck + lint + test
bun run ci
```

Handy dev loop:

```bash
bun run test:watch
```

Fixtures live under `src/markdown/__tests__/__fixtures__/`. To regenerate example outputs used in README/tests:

```bash
bun scripts/gen-fixtures.ts
```

## Local development

- Runtime: Bun. The repo is ESM‑only (NodeNext). Use explicit `.js` extensions for relative imports in TS.
- Tests: Vitest via Bun (`bun run test`, `bun run test:watch`). Coverage uses v8.
- Lint/format: ESLint + Prettier. Run `bun run lint` to check; `bun run fix` to apply fixes.
- Types: `bun run typecheck` runs `tsc --noEmit`.
- Build: `bun run build` runs the generator (`zshy`) that maintains the package metadata and build output. CI enforces that `package.json` is up‑to‑date after a build.

## Commit and PR flow

- Keep changes small and scoped. Follow existing patterns and file conventions.
- Commit messages: conventional-ish style is used in this repo, e.g.,
  - `feat(slack): preserve task list state in bullets`
  - `fix(github): escape backslash hard breaks`
  - `docs(readme): rewrite quick start`
- Branch off `master`. Do not push directly to `master`.
- Open Draft PRs for WIP/RFC. Mark “Ready for review” when checks are green and scope is stable.
- Before pushing or requesting review, run local checks: `bun run ci`.
- PR description: include a short summary, a concise list of changes, and how you verified them. Link related issues.

## CI overview

- Workflow: `.github/workflows/ci.yml` runs on pull requests and pushes to `master`.
  - Setup Bun and install deps (`bun install --frozen-lockfile`).
  - Verify `package.json` is current by running `bun run build` (fails if it would change the file).
  - Typecheck (`bun run typecheck`), Lint (`bun run lint`), Tests (`bun run test`).
- Secrets: tests can read `SLACK_BOT_TOKEN` and `LINEAR_API_KEY` if present; otherwise tests still pass (features degrade safely).

## Release process

Releases are automated from `master`.

1. Bump the version in `package.json` (semver). Example commit/PR title: `chore(release): vX.Y.Z`.
2. Open a PR with just the version bump (and any generated build metadata, if present).
3. Merge to `master`.
4. The release workflow (`.github/workflows/release.yml`) will:
   - Install deps, typecheck, lint, test, and build.
   - Publish to npm when `NPM_TOKEN` is configured and the version is not already on npm (publishing is skipped if it already exists).
   - Create a Git tag and GitHub Release `vX.Y.Z` with generated release notes.
   - Publish uses npm provenance (OIDC), enabled via `permissions: id-token: write`.

Notes

- It’s safe to re‑run the release job from Actions; the publish step skips already‑published versions.
- You can also run checks locally beforehand with `bun run ci`.

## Code of Conduct and Security

- Code of Conduct: see [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- Security policy (reporting vulnerabilities): see [SECURITY.md](./SECURITY.md)

We’re grateful for contributions of any size—bug reports, tests, docs, and code.
