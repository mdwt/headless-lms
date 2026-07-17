# Headless LMS

Monorepo scaffold for a headless LMS. Hexagonal architecture, framework-free domain core, adapters for outbound infra, and thin inbound entry points (HTTP, CLI, workers, cron).

## Stack

- **Runtime:** Node 22 LTS · ESM · TypeScript (strict)
- **Package manager:** pnpm workspaces
- **HTTP:** Fastify · **ORM:** Drizzle + Postgres
- **API contract:** Zod schemas → request/response validation (`fastify-type-provider-zod`) → OpenAPI (`@fastify/swagger`) → generated SDK (`@hey-api/openapi-ts`)
- **Frontends:** Next.js (`apps/admin`, `apps/student`) · TanStack Query · plus `apps/web` (older Vite student UI)
- **Tests:** Vitest
- **Build:** `tsdown` (api + packages/plugins) via `pnpm -r build`; `tsc` is typecheck-only

## Layout

```
apps/
  api/   backend service (Fastify)
    src/
      core/         framework-free domain, one folder per bounded context
      adapters/     outbound infra (db, auth, email, events, inmemory, payment, storage, video)
                    db/schema/        centralized Drizzle tables (one file per context)
                    db/repositories/  Drizzle repository implementations
                    inmemory/         in-memory repos for contexts without Drizzle tables yet
      composition/  container.ts — wires adapters + services
      http/ cli/ workers/ cron/   inbound entry points
    scripts/      gen-openapi.ts — emits the OpenAPI spec from the live routes
  admin/    Next.js back-office dashboard
  student/  Next.js student course UI (recently added)
  web/      older Vite student UI — overlaps the newer `student` (Next) app
packages/
  api-contract/   Zod schemas — single source of truth for the HTTP API
  sdk/            @headless-lms/sdk — generated, resource-based client (off the spec)
  types/          @headless-lms/types — domain types, events & integration contract (pure types)
  utils/          @headless-lms/utils — runtime helpers for integrations (zod adapters)
plugins/
  slack/          @headless-lms/plugin-slack — the Slack integration
```

### Bounded contexts

14 contexts (+ `shared` for cross-cutting ports), at varying build states:

- **Built, Postgres-persisted:** `organizations`, `identity`, `assets` (uploads via MinIO presigned URLs)
- **Built, in-memory:** `team` (member invite / role / remove), `enrollments` (grant / list / setStatus), `modules` (Module + ModuleItem)
- **Partial:** `courses` (metadata service in-memory, schema stub)
- **Read-models (in-memory):** `students` (over `identity`), `dashboard`
- **Stub / deferred:** `entitlements` (real behavior lives in `enrollments`), `progress`, `offers` (deferred), `billing` (deferred)

Each context has the same file contract: `service.ts`, `model.ts`, `types.ts`,
`events.ts`, `ports.ts`, `index.ts`, `service.test.ts`. Persistence lives outside
core: tables in `adapters/db/schema/<context>.ts`, repository implementations in
`adapters/db/repositories/<context>.ts`.

### Multi-tenancy

`organizations` is the tenant root. Every org-scoped table carries a composite
`(org_id, id)` primary key with `org_id` → `organizations.id`. **better-auth's
organization plugin owns** the org / membership / invitation records (in
`adapters/auth/schema.ts`); the auth adapter's `organizationHooks` **mirror** them
into the `organizations` context (resolving auth user ids to domain student ids so
core never touches the auth schema). `students` stay global (one per auth user);
org membership is the user↔org link, with the creator mirrored as the `owner`.

### Boundaries (enforced by ESLint)

- A context imports another context **only** through its `index.ts`.
- `core/` may not import `adapters/`, `http/`, `composition/`, frameworks, or `drizzle-orm` (persistence-free).
- `adapters/` own the Drizzle schema + repositories and may import `core/` ports only.

## API contract & SDK

The HTTP API is schema-first and the frontend client is generated **off the OpenAPI spec** — nothing is hand-written or kept in sync by hand.

```
packages/api-contract   Zod schemas (single source of truth)
        │
        ├─ apps/api   fastify-type-provider-zod  → validates request + response
        │             @fastify/swagger           → OpenAPI at /docs and /docs/json
        │
        └─ pnpm gen:sdk
              ├─ apps/api gen:openapi   boots the app, writes packages/sdk/openapi.json
              └─ @hey-api/openapi-ts    → packages/sdk/src/generated  (resource SDK)
                       │
              apps/admin · apps/student   import @headless-lms/sdk
```

- **Validation is automatic, both directions.** Routes attach the shared Zod schemas, so a bad request is rejected with `400` and a handler returning an off-contract payload fails instead of shipping drift. The same schemas produce the OpenAPI spec.
- **The SDK is resource-based and fully typed** — `Courses.listCourses({ query })`, `Courses.getCourse({ path: { id } })`, etc. Point it at an origin once with `configureSdk({ baseUrl })`.
- **Specced resources** (one SDK class each): `Courses`, `Modules`, `Students`, `Enrollments`, `Team`, `Dashboard` — mirroring the admin dashboard surface. Back-office contexts are backed by in-memory repos until their Drizzle tables exist.
- **Regenerate after changing the contract or routes:** `pnpm gen:sdk`. The generated `packages/sdk/openapi.json` and `packages/sdk/src/generated/` are committed — a stale diff in review means someone forgot to regenerate. (`gen:openapi` boots the app, so the database must be running.)
- **To add a resource:** add its schemas to `packages/api-contract`, add a route file in `apps/api/src/http/routes/` (Zod type provider + `tags: ["<Resource>"]`), register it in `server.ts`, then `pnpm gen:sdk`.

See `packages/api-contract/README.md` and `packages/sdk/README.md` for details.

## Scripts

| Script | Action |
| --- | --- |
| `pnpm dev` | `pnpm --parallel --filter "./apps/*" dev` — runs all four apps (api, admin, student, web) |
| `pnpm build` | `pnpm -r build` (api + packages/plugins build with `tsdown`) |
| `pnpm test` | `vitest run` across workspaces |
| `pnpm test:watch` | watch mode |
| `pnpm lint` | eslint incl. boundary rules |
| `pnpm typecheck` | `pnpm -r typecheck` |
| `pnpm db:generate` | tsx wrapper around `drizzle-kit generate` (reads root `.env`) |
| `pnpm db:migrate` | tsx wrapper around `drizzle-kit migrate` (reads root `.env`) |
| `pnpm gen:sdk` | regenerate the OpenAPI spec + typed SDK from the API routes |
| `pnpm --filter @headless-lms/api seed` | seed random data across every domain (`apps/api`) |

## Getting started

```bash
pnpm install
cp .env.example .env
pnpm typecheck
pnpm test
```

## Local development

```bash
docker compose -f docker/docker-compose.yml up -d   # Postgres (:8005) + MinIO (:8006/:8007)
cp .env.example .env        # root .env — set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm db:generate            # generate Drizzle migrations
pnpm db:migrate             # apply them
pnpm --filter @headless-lms/api seed   # optional: seed random data across every domain
pnpm dev                    # api :8000 · admin :8001 · student :8002
```

The database must be up before `pnpm dev` and `pnpm gen:sdk` — `gen:openapi` boots
the real app and reads the root `.env`. DB scripts run drizzle-kit via
`tsx --env-file=../../.env`, so they read the same root `.env`.
