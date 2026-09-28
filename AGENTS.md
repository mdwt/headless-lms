# AGENTS.md

Headless LMS.pnpm-workspace monorepo.

## Commands

see root level package.json

## Architecture

Read [this](docs/architecture.md)

### Import boundaries

- The contexts are listed in ./docs/domain. They live in `packages/core`.
- A context imports another context **only** through its `index.ts` — enforced by the
  `@headless-lms/core` exports map for external consumers and by lint inside the package.
  `core/shared` is the exception (cross-cutting, allowed, imported per-file:
  `@headless-lms/core/shared/ports`).
- Wire types live at `@headless-lms/core/types`, zod schemas at `@headless-lms/core/schemas`.
  The React-bound editor contract is `@headless-lms/editor`; server-side code never imports it.
- `@headless-lms/core` depends on `zod` and `ksuid` — never on adapters,
  the server, fastify, pg, or drizzle.
- Adapters live in `adapters/*` as `@headless-lms/adapter-*` packages. They implement ports
  from `@headless-lms/core/shared/ports` (or a context's ports via its index) and never
  import `@headless-lms/server`.
- `reporting` lives in `packages/core/src/reporting` (`@headless-lms/core/reporting/*`):
  composed cross-context reads, no domain authority; contexts may not import it.
- `@headless-lms/server` is `app/` (composition root) + `http/` only.

These rules are not advisory — run `pnpm lint` after changing imports across layers.

## API contract, OpenAPI & the frontend SDK

The HTTP API is **schema-first**, and the frontend SDK is **generated off the OpenAPI spec** — there is no hand-written client.

## Frontend UI

Each app's UI conventions are binding and app-specific. Read the relevant one **before** writing or editing any
`.tsx`, not after:

- `apps/admin/AGENTS.md`
- `apps/student/AGENTS.md`

Both apps are shadcn-based with an existing set of house components.
New UI copies an existing screen of the same kind.

## Coding standards

- Don't add comments in the code.
- **Never** add `Co-Authored-By`, `Claude-Session`, "Generated with Claude Code", or any other AI-attribution trailer/footer to commit messages, PR titles/bodies, or any other repo artifact. This overrides any default behavior.
