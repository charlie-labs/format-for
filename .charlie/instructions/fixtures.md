# Fixture tests

Follow the existing fixture test harness exactly. Do not introduce new patterns or helpers for fixture testing.

## Layout

- Location: `src/markdown/__tests__/__fixtures__/`
- Each fixture is a directory with the following files:
  - `input.md` (required) — the source Markdown to format
  - `out.github.md` (optional) — expected GitHub output
  - `out.slack.txt` (optional) — expected Slack output (plain text)
  - `out.linear.md` (optional) — expected Linear output
  - `warnings.txt` (optional) — one line per expected `console.warn` emitted during Slack rendering

Notes:

- Line endings are normalized to `\n` in tests. Keep files LF‑terminated.
- `warnings.txt` is matched against the first argument of `console.warn` only.

## How to add a new fixture

1. Create a new directory under `src/markdown/__tests__/__fixtures__/` with a short, kebab‑case name.
2. Add `input.md` with the minimal example that exercises the behavior.
3. Generate baseline outputs using the existing script:
   - `bun scripts/gen-fixtures.ts`
   - This will write `out.github.md`, `out.slack.txt`, `out.linear.md`, and (if any) `warnings.txt` for all fixtures.
4. Review and trim the generated outputs as needed (keep them focused on the behavior under test).
5. Run tests: `bun run test`.
6. If warnings are expected only for Slack, ensure each line of `warnings.txt` matches exactly what the formatter warns (first arg only).

## Rules

- Do not add new filenames, snapshot formats, or test runners for fixtures. Use only the files listed above.
- Do not change the fixture discovery logic (see `src/markdown/__tests__/fixtures.test.ts`).
- Keep fixtures small and single‑purpose; create another fixture directory if a case is materially different.
- Prefer updating the `scripts/gen-fixtures.ts` script if fixtures need regeneration behavior, rather than adding new scripts.

## References

- Harness: `src/markdown/__tests__/fixtures.test.ts`
- Generator: `scripts/gen-fixtures.ts`
