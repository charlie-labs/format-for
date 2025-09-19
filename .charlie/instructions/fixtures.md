# Fixture tests

Follow the existing fixture test harness exactly. Do not introduce new patterns or helpers for fixture testing.

## Layout

- Location: `src/markdown/__tests__/__fixtures__/`
- Each fixture is a directory containing these files (required for all new fixtures):
  - `input.md` — the source Markdown to format
  - `out.github.md` — expected GitHub output (Markdown)
  - `out.slack.txt` — expected Slack output (plain text)
  - `out.linear.md` — expected Linear output (Markdown)
  - `warnings.txt` (optional) — one line per expected warning message emitted during Slack rendering

Notes:

- Line endings are normalized to `\n` in tests. Keep files LF-terminated.
- Warnings are collected during the Slack rendering phase only and matched against the first argument of `console.warn`.

## How to add a new fixture

1. Create a new directory under `src/markdown/__tests__/__fixtures__/` with a short, kebab-case name.
2. Add `input.md` with the minimal example that exercises the behavior.
3. Author the expected outputs by hand:
   - Write `out.github.md`, `out.slack.txt`, and `out.linear.md` to reflect the exact, intended results for the input.
   - If Slack should emit warnings, add `warnings.txt` with one expected warning per line (match the first argument of `console.warn`).
4. Keep outputs focused on the behavior under test (avoid unrelated content).
5. Run tests: `bun run test` (or `bun run test:watch` for faster iteration).

## Rules

- Do not add new filenames, snapshot formats, or test runners for fixtures. Use only the files listed above.
- Do not change the fixture discovery logic (see `src/markdown/__tests__/fixtures.test.ts`).
- Keep fixtures small and single-purpose; create another fixture directory if a case is materially different.
- Do not add generator scripts or helpers—author expected outputs directly in the fixture files.

## References

- Harness: `src/markdown/__tests__/fixtures.test.ts`
