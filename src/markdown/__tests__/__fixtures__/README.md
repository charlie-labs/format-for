# Fixture contract

This folder contains canonical, file-based fixtures used by `fixtures.test.ts` to assert exact renderer outputs and any emitted warnings for Slack and Linear.

## File layout per fixture directory

Required/optional files:

- `input.md` — source Markdown driving the fixture (required)
- `out.github.md` — expected GitHub output (optional)
- `out.slack.txt` — expected Slack output (optional)
- `out.linear.md` — expected Linear output (optional)
- `warnings.txt` — optional, newline-delimited Slack warnings captured from `console.warn`
- `warnings.linear.txt` — optional, newline-delimited Linear warnings captured from `console.warn`

Notes:

- Warning files are optional. When present, tests assert that the sequence of `console.warn` calls for that target matches the file exactly (one warning per line, trailing newline allowed). When absent, warnings for that target are ignored.
- The generator script (`scripts/gen-fixtures.ts`) renders each target and captures warnings by temporarily monkey‑patching `console.warn`. It writes `warnings.txt` for Slack and `warnings.linear.txt` for Linear when any warnings were emitted.
- Windows-style newlines in expected files are normalized to `\n` during test reads.

## Adding a new fixture

1. Create a new directory under this folder with a concise name.
2. Add `input.md`.
3. Run `bun scripts/gen-fixtures.ts` to generate outputs and warning files for any targets that emit warnings.
4. If needed, edit the expected outputs by hand, then re‑run the generator to refresh warning files.

Keep fixtures focused on one idea each so diffs stay readable.
