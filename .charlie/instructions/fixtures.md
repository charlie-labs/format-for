# Fixture tests

Follow the existing fixture test harness exactly. Keep the contract narrow and file-based, but we now support optional warnings capture for Slack and Linear.

## Layout

- Location: `src/markdown/__tests__/__fixtures__/`
- Each fixture is a directory containing these files:
  - `input.md` — the source Markdown to format (required)
  - `out.github.md` — expected GitHub output (Markdown; optional)
  - `out.slack.txt` — expected Slack output (plain text; optional)
  - `out.linear.md` — expected Linear output (Markdown; optional)
  - `warnings.txt` — optional, one line per expected warning emitted during Slack rendering
  - `warnings.linear.txt` — optional, one line per expected warning emitted during Linear rendering

Notes:

- Line endings are normalized to `\n` in tests. Keep files LF-terminated.
- Warning files are matched against the first argument to `console.warn`, one per line. When a warnings file for a target is absent, warnings for that target are ignored by the harness.

## How to add a new fixture

1. Create a new directory under `src/markdown/__tests__/__fixtures__/` with a short, kebab-case name.
2. Add `input.md` with the minimal example that exercises the behavior.
3. Generate expected outputs and warning files using the helper script:
   - `bun scripts/gen-fixtures.ts`
   - This renders all targets and captures warnings for Slack (`warnings.txt`) and Linear (`warnings.linear.txt`) when emitted.
4. If needed, edit the expected outputs by hand and re-run the generator to refresh warning files.
5. Keep outputs focused on the behavior under test (avoid unrelated content), then run tests: `bun run test` (or `bun run test:watch`).

## Rules

- Do not add new snapshot formats or test runners; use only the files listed above.
- Do not change the fixture discovery logic (see `src/markdown/__tests__/fixtures.test.ts`).
- Keep fixtures small and single-purpose; create another fixture directory if a case is materially different.
- The generator script `scripts/gen-fixtures.ts` is the only supported helper; avoid adding new generators or harness variants.

## References

- Harness: `src/markdown/__tests__/fixtures.test.ts`
- Fixture guide in-repo: `src/markdown/__tests__/__fixtures__/README.md`
