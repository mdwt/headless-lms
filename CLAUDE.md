# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Headless LMS — pnpm-workspace monorepo. Node 22, ESM, strict TypeScript. `apps/api` (Fastify + Drizzle/Postgres), `apps/web` (React + Vite), `packages/shared-types` (api↔web types).

## Commands

```bash
pnpm dev              # run api (tsx watch) + web (vite) in parallel
pnpm build            # build all workspaces
pnpm test             # vitest run, all workspaces
pnpm test:watch
pnpm lint             # eslint incl. architecture boundary rules
pnpm typecheck        # tsc -b
pnpm db:generate      # drizzle-kit generate (api)
pnpm db:migrate       # drizzle-kit migrate (api)
```

Single test: `pnpm vitest run path/to/file.test.ts` or `pnpm vitest run -t "test name"`.
Per-workspace: `pnpm --filter @headless-lms/api <script>`.

## Architecture

Hexagonal. The api (`apps/api/src/`) is layered:

- `core/<context>/` — framework-free, runtime-free, **persistence-free** domain. One folder per bounded context: `organizations`, `courses`, `entitlements`, `offers`, `billing`, `progress`, `identity` (+ `shared/`).
- `adapters/` — outbound infra: `db`, `payment`, `email`, `video`, `storage`, `events`. Drizzle schema and repositories live here, **not** in core:
  - `adapters/db/schema/<context>.ts` — centralized table definitions, re-exported from `schema/index.ts` (the single source `drizzle.config.ts` points at).
  - `adapters/db/repositories/<context>.ts` — `Drizzle*Repository` classes implementing the core outbound ports.
- `composition/container.ts` — wires adapters into services.
- Inbound entry points: `http/`, `cli/`, `workers/`, `cron/`.

Each context has the same file contract: `service.ts`, `model.ts`, `types.ts`, `events.ts`, `ports.ts`, `index.ts`, `service.test.ts`. The outbound port interface (e.g. `CoursesRepository`) lives in the context's `ports.ts`; its Drizzle implementation lives in `adapters/db/repositories/`.

### Multi-tenancy

`organizations` is the tenant root. Org-scoped tables use a composite `(org_id, id)` PK with `org_id` → `organizations.id`. **better-auth's organization plugin is the source of truth** for org/membership/invitation (tables in `adapters/auth/schema.ts`); the auth adapter's `organizationHooks` mirror them into the `organizations` core context. The adapter resolves auth user ids → domain student ids before calling core (via `IdentityService`), so core never imports the auth schema — same pattern as `user → student`. `students` are global (one per auth user); the org↔user link is membership, and the creating user is mirrored as the `owner`. When adding org-scoped tables, mirror this composite-key shape.

### Import boundaries (enforced by ESLint — `.eslintrc.cjs`)

- A context imports another context **only** through its `index.ts` (no deep imports). `core/shared/ports` is the exception (cross-cutting, allowed).
- `core/` may not import `adapters/`, `http/`, `composition/`, frameworks (`fastify`, `pg`), or `drizzle-orm`.
- `adapters/` may import `core/` ports only.
- `composition/` wires `core` + `adapters`; inbound entry points use `composition` + `core`.

These rules are not advisory — run `pnpm lint` after changing imports across layers.
