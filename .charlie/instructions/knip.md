# Knip Instructions

We use [Knip](https://knip.dev/) to track unused code and ensure that dependencies are correct. It is configured using `/knip.ts` (in the repo root) and runs from GitHub Actions CI workflow.

## Knip Configuration Rules

- The `entry` field should only include the specific entry files and should never be a broad glob pattern like `**/*.ts` that includes many files, because that breaks Knip's dead‑code detection.
  - Exception: It's ok to use the test glob `**/*.test.ts` to include all test files.
  - Exception (oclif commands): our CLI is built with oclif, which discovers commands by scanning a directory. To ensure Knip treats all command files as entry points, we allow a narrow, documented glob for command entries: `src/cli/commands/**/*.ts`. This is the only permitted non‑test glob in `entry`.
  - Generic glob patters also **should not** be used to ignore files.
- The `ignoreDependencies` field should only include the specific dependencies and should **never** be a glob pattern like `*` that includes many dependencies because that will break Knip's dead code removal.

## How to resolve Knip errors

- Unused file: delete the file
- Unused dependency (including devDependencies): remove the dependency from `package.json` and update the lockfile
- Unlisted dependency (including devDependencies): add the dependency to `package.json` and update the lockfile
- Unused export (including types): stop exporting the symbol (remove `export` keyword)
- Duplicated export: remove one of the exports (prefer removing the `default` export if possible)
- Unlisted binary: add the binary to `ignoreBinaries` in `knip.ts`
