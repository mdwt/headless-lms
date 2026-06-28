# Headless LMS

Monorepo scaffold for a headless LMS. Hexagonal architecture, framework-free domain core, adapters for outbound infra, and thin inbound entry points (HTTP, CLI, workers, cron).

## Stack

- **Runtime:** Node 22 LTS · ESM · TypeScript (strict)
- **Package manager:** pnpm workspaces
- **HTTP:** Fastify · **ORM:** Drizzle + Postgres
- **Tests:** Vitest (Node for api, jsdom for web)
- **Build:** `tsc` (api) · Vite (web)

## Layout

```
apps/
  api/   backend service
    src/
      core/         framework-free domain, one folder per bounded context
      adapters/     outbound infra (db, payment, email, video, storage, events)
                    db/schema/        centralized Drizzle tables (one file per context)
                    db/repositories/  Drizzle repository implementations
      composition/  container.ts — wires adapters + services
      http/ cli/ workers/ cron/   inbound entry points
  web/   React student UI + checkout
packages/
  shared-types/   types shared api <-> web
```

### Bounded contexts

`organizations` · `courses` · `entitlements` · `offers` · `billing` · `progress` · `identity`

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

## Scripts

| Script | Action |
| --- | --- |
| `pnpm dev` | run api (`tsx watch`) + web (`vite`) |
| `pnpm build` | build all packages |
| `pnpm test` | `vitest run` across workspaces |
| `pnpm test:watch` | watch mode |
| `pnpm lint` | eslint incl. boundary rules |
| `pnpm typecheck` | `tsc -b` |
| `pnpm db:generate` | drizzle-kit generate |
| `pnpm db:migrate` | drizzle-kit migrate |

## Getting started

```bash
pnpm install
cp .env.example .env
pnpm typecheck
pnpm test
```
