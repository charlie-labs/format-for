# TypeScript Instructions

## Type Safety

ABSOLUTELY DO NOT use `any`, `as`, non-null `!`, double-casts (`x as unknown as T`), or "satisfies any" in production code.

Allowed ONLY when ALL of the following are true:

1. File is a test/fixture _or_ a generic default type parameter, _or_ a validated trust boundary.
2. No safer pattern (Zod parse, type guard, discriminated union, generics, `asserts` helper, `as const`) can express the intent.

Preferred alternatives:

- Use `'key' in obj` to narrow object types.
- Use `unknown` at the boundary + Zod / custom type guards to narrow.
- Use generics or helper overloads instead of casting.
- Use `asserts condition` functions (e.g. `assertIsFoo(value): asserts value is Foo`).
- Throw early (`if (!foo) throw new Error('foo required')`) instead of `foo!`.
- Use `satisfies` to _check_ shapes, not to erase them.
- Create a discriminated union instead of down-casting.

`as const` remains allowed for literal narrowing.

## Modules

- Always use ESM `import` and `export` (never use CJS `require`)
  - File imports should end with `.js` (NOT `.ts` or `.tsx`). Module or subpath imports don't need the extension.
- Always prefer named exports over default exports
  - Exception: it's OK to use default exports in the CLI because it is required by oclif
- Avoid barrel exports (`export * from './foo.js';`) and instead use named exports (`export { foo } from './foo.js';`)

## Miscellaneous

- Prefer `const` over `let` when variable reassignment is not needed (never use `var`)
- Prefer `type` over `interface` for type definitions when possible
- Utilize TypeScript's utility types (e.g., `Partial`, `Pick`, `Omit`) when appropriate
- Define parameter interfaces for functions with multiple parameters
- Always add return type definitions to functions
- Prefer `async`/`await` over `.then()` and `.catch()`
- Don't use `@ts-ignore` or similar directives unless absolutely necessary
