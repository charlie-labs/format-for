# Bun Instructions

Default to using Bun for the runtime and scripts, while using Vitest as the test runner.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing (Vitest preferred)

- Prefer Vitest for unit, snapshot, and property tests, with v8 coverage.
- Run tests via scripts: `bun run test` (which invokes `vitest run --coverage`).
- Use watch mode locally with `bun run test:watch`.

```ts#index.test.ts
import { test, expect } from 'vitest';

test('hello world', () => {
  expect(1).toBe(1);
});
```

For Bun runtime APIs, read the Bun API docs in `node_modules/bun-types/docs/**.md`.
