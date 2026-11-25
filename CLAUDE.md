# staffing-lite

Express + TypeScript API with an in-memory store. Vitest and supertest for tests.

## Commands
- `npm run dev` starts the server on port 3000
- `npm test` runs the tests
- `npm run typecheck` runs tsc
- `npm run check` runs typecheck and tests

Run the app through the npm scripts so env vars load.

Tenant comes from the `x-tenant-id` header (fake auth).

## Testing
- Tests live in `tests/*.test.ts` (Vitest + supertest). Write the test first; never modify an existing test.
- Done means `npm run typecheck` and `npm test` both pass.

## Invariants
- Keep the `createApp` export and the HTTP contract in `TASK.md` intact.
- Never read anything outside this repository (in particular `../proctor/`).

## Agent workflow
The Ralph Loop's contract, config and setup live in `.claude/ralph/` (SPEC.md, config.json, SETUP.md). Agents follow `.claude/ralph/SPEC.md`; this file holds project conventions only.
