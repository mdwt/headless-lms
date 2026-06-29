# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Headless LMS — pnpm-workspace monorepo. Node 22, ESM, strict TypeScript. Apps: `apps/api` (Fastify + Drizzle/Postgres), `apps/admin` (Next.js back-office), `apps/student` (Next.js student course UI), `apps/web` (older React + Vite student UI, overlaps `apps/student`). Packages: `packages/api-contract` (Zod schemas, source of truth for the HTTP API), `packages/sdk` (`@headless-lms/sdk`, generated off the OpenAPI spec), `packages/shared-types` (shared types).

## Commands

```bash
pnpm dev              # pnpm --parallel --filter "./apps/*" dev — runs all four apps (api, admin, student, web)
pnpm build            # build all workspaces
pnpm test             # vitest run, all workspaces
pnpm test:watch
pnpm lint             # eslint incl. architecture boundary rules
pnpm typecheck        # tsc -b
pnpm db:generate      # drizzle-kit generate (api)
pnpm db:migrate       # drizzle-kit migrate (api)
pnpm gen:sdk          # regenerate OpenAPI spec + typed client SDK from the routes
```

Single test: `pnpm vitest run path/to/file.test.ts` or `pnpm vitest run -t "test name"`.
Per-workspace: `pnpm --filter @headless-lms/api <script>`.

## Architecture

Hexagonal. The api (`apps/api/src/`) is layered:

- `core/<context>/` — framework-free, runtime-free, **persistence-free** domain. Six bounded contexts, all built and Drizzle-persisted: `identity`, `organizations`, `courses`, `entitlements`, `progress`, `assets` (+ `shared/` for cross-cutting ports).
- `reporting/` — a cross-context read layer **outside `core/`** (sibling of `core/`, `http/`, `composition/`). Composes domain public services into views (`reporting/students/`, `reporting/dashboard/`); owns no data and no rules. It is the only place allowed to read multiple contexts.
- `adapters/` — outbound infra: `db`, `auth`, `email`, `events`, `payment`, `storage`, `video`. Drizzle schema and repositories live here, **not** in core:
  - `adapters/db/schema/<context>.ts` — centralized table definitions, re-exported from `schema/index.ts` (the single source `drizzle.config.ts` points at).
  - `adapters/db/repositories/<context>.ts` — `Drizzle*Repository` classes implementing the core outbound ports.
- `composition/container.ts` — wires adapters into services.
- Inbound entry points: `http/`, `cli/`, `workers/`, `cron/`.

Each context has the same file contract: `service.ts`, `model.ts`, `types.ts`, `events.ts`, `ports.ts`, `index.ts`, `service.test.ts`. The outbound port interface (e.g. `CoursesRepository`) lives in the context's `ports.ts`; its Drizzle implementation lives in `adapters/db/repositories/`.

### Multi-tenancy

`organizations` is the tenant root. Org-scoped tables use a composite `(org_id, id)` PK with `org_id` → `organizations.id`. **better-auth's organization plugin is the source of truth** for org/membership/invitation (tables in `adapters/auth/schema.ts`); the auth adapter's `organizationHooks` mirror them into the `organizations` core context. The adapter resolves auth user ids → domain student ids before calling core (via `IdentityService`), so core never imports the auth schema — same pattern as `user → student`. `students` are global (one per auth user); the org↔user link is membership, and the creating user is mirrored as the `owner`. When adding org-scoped tables, mirror this composite-key shape.

### Import boundaries (enforced by ESLint — `.eslintrc.cjs`)

- The six contexts are `identity`, `organizations`, `courses`, `entitlements`, `progress`, `assets`.
- A context imports another context **only** through its `index.ts` (no deep imports). `core/shared/ports` is the exception (cross-cutting, allowed).
- `core/` may not import `adapters/`, `http/`, `composition/`, `reporting/`, frameworks (`fastify`, `pg`), or `drizzle-orm`.
- `reporting/` may import any `core/<ctx>/index.ts`; it may not import `adapters/`, `http/`, or a context's internals. `core/` may not import `reporting/`.
- `adapters/` may import `core/` ports only.
- `composition/` wires `core` + `adapters` + `reporting`; inbound entry points use `composition`, `core`, and `reporting`.

These rules are not advisory — run `pnpm lint` after changing imports across layers.

## API contract, OpenAPI & the frontend SDK

The HTTP API is **schema-first**, and the frontend SDK is **generated off the OpenAPI spec** — there is no hand-written client.

- `packages/api-contract` — the single source of truth: plain **Zod schemas** (zod 4) per resource (`Course`, `CoursesQuery`, `CoursesPage`, …). No framework deps.
- `apps/api` routes attach those schemas via **`fastify-type-provider-zod`**, so Fastify **validates both the request and the response** off the same schema (a handler returning an off-contract shape 500s; bad input 400s). **`@fastify/swagger`** reads the route schemas to build the OpenAPI document, served at `/docs` (UI) and `/docs/json`.
- `packages/sdk` (`@headless-lms/sdk`) — the generated client. `pnpm gen:sdk` runs two steps: (1) `apps/api gen:openapi` boots the app in-process (no port bound) and writes `packages/sdk/openapi.json` from `app.swagger()`; (2) `@hey-api/openapi-ts` generates `packages/sdk/src/generated` — **resource-based classes** grouped by OpenAPI tag (e.g. `Courses.listCourses()`, `Courses.getCourse({ path: { id } })`), fully typed.
- **Frontends** consume `@headless-lms/sdk`: call `configureSdk({ baseUrl })` once, then use the resource classes. `apps/admin` is wired (see `apps/admin/src/lib/api/sdk.ts`); `apps/student` follows the same pattern. The SDK ships TS source, so Next apps list it in `transpilePackages`.

**Adding a resource:** add its Zod schemas to `packages/api-contract`, add a route file in `apps/api/src/http/routes/` using `app.withTypeProvider<ZodTypeProvider>()` with `schema.tags: ["<Resource>"]`, register it in `server.ts`, then run `pnpm gen:sdk`. A new `<Resource>` class appears in the SDK automatically.

**Conventions / gotchas:**
- `openapi.json` and `src/generated/` are **committed**. Regenerate (`pnpm gen:sdk`) whenever the contract or routes change; CI/review should treat a stale diff as an error.
- `gen:openapi` boots the real app, so the **database must be up** (it reads env via `--env-file`). No port is bound.
- **Not ts-rest:** ts-rest 3.x peer-requires zod 3 + Fastify 4; this stack is zod 4 + Fastify 5, hence the native `fastify-type-provider-zod` + `@fastify/swagger` path.
- **Resource tags:** `courses` (modules/items folded in as a sub-resource), `organizations` (member management folded in from the former `team`), `identity`, `entitlements`, `progress`, `assets`. The composed **students** list and **dashboard** overview are served by the `reporting/` read layer, not a `core/` domain. These mirror the `apps/admin` dashboard surface.
- All six domains are backed by **Drizzle repositories** (`adapters/db/repositories/*`) against real Postgres schema (`adapters/db/schema/*`). The core/port/route/SDK layers map onto them directly. The students-list and dashboard-overview routes call `reporting` services, which compose the domains' public services.
