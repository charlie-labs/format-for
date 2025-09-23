# General Instructions

- Write elegant, concise, and readable code
- Use descriptive variable, function, and class names that clearly indicate purpose and functionality
- Follow the existing project structure and patterns when adding new features or making changes
- Maintain consistent error handling approaches throughout the codebase
- Use ES modules syntax for imports and exports (the project uses `type: "module"`)
- Keep functions focused on a single responsibility
- Avoid deeply nested code structures when possible
- Document any complex logic with clear comments
- Prefer clarity over brevity when the two are in conflict

## Releases & publishing

This repo uses a PR+Action release flow:

- On push to `master`, `.github/workflows/release.yml` runs typecheck/lint/tests and then publishes to npm when all pass and `NPM_TOKEN` is set.
- The workflow only publishes if the `package.json` version does not already exist on npm; otherwise it no-ops.
- When a new version is published, the action also creates a Git tag and GitHub Release titled `v<version>` with generated notes.
- npm provenance is enabled (OIDC) via `permissions: id-token: write` and `provenance: true` in the publish step.

How to cut a release:

1. Open a PR that bumps `package.json#version` and includes any changelog/context.
2. Merge to `master`. If `NPM_TOKEN` is configured, the action will publish and create the GitHub Release automatically.
3. If the workflow fails, re-run it from the Actions tab after fixing the issue; it is safe to re-run because it skips already-published versions.
