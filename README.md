# Headless LMS

A headless LMS shipped as a library. `@headless-lms/server` is the backend —
hexagonal, framework-free domain core, Drizzle/Postgres adapters, Fastify HTTP
layer. An installation composes it with its own config and integration
plugins; `create-headless-lms` scaffolds one, and `apps/api` is this repo's
own installation.

## Stack

- Node 22 LTS · ESM · TypeScript (strict) · pnpm workspaces
- Fastify · Drizzle + Postgres · better-auth · MinIO
- Zod contract → validation (`fastify-type-provider-zod`) → OpenAPI (`@fastify/swagger`) → generated SDK (`@hey-api/openapi-ts`)
- Next.js frontends · Vitest · `tsdown` builds (`tsc` is typecheck-only)

## Layout

```
apps/
  api/            this repo's installation of @headless-lms/server (port 8000)
  admin/          Next.js back-office (port 8001)
  student/        Next.js student app (port 8002)
packages/
  server/         @headless-lms/server — the backend as a library (core, adapters, http)
  cli/            @headless-lms/cli — the headless-lms bin (migrate, seed)
  create-headless-lms/  npm create headless-lms — installation scaffolder
  types/          @headless-lms/types — domain types, events & integration contract (pure types)
  utils/          @headless-lms/utils — runtime helpers for integrations (zod adapters)
  api-contract/   Zod schemas — single source of truth for the HTTP API
  sdk/            @headless-lms/sdk — generated, resource-based client (off the spec)
plugins/
  slack/          @headless-lms/plugin-slack — the Slack integration
```

Each workspace has its own README; architecture details live in `docs/` and
`packages/server/README.md`.

## Architecture in one paragraph

`packages/server/src/core/` holds the bounded contexts (`identity`,
`organizations`, `content`, `entitlements`, `progress`, `assets`,
`integrations`) — framework-free, persistence-free. `adapters/` implement the
outbound ports (Drizzle schema + repositories, auth, storage, …),
`composition/` wires them, `http/` serves routes validated against
`packages/api-contract`, and `reporting/` composes cross-context reads.
Integrations are plugins: one folder per integration in an installation's
`plugins/` dir, each default-exporting the `Integration` contract from
`@headless-lms/types`. ESLint enforces the layer boundaries (`pnpm lint`).

## API contract & SDK

Schema-first: routes attach the shared Zod schemas, so requests **and**
responses are validated, and the same schemas produce the OpenAPI doc
(`/docs`). `pnpm gen:sdk` regenerates `packages/sdk` from the live routes —
`openapi.json` and `src/generated/` are committed, so a stale diff in review
means someone forgot to regenerate.

## Getting started

```bash
pnpm install
docker compose -f docker/docker-compose.yml up -d   # Postgres (:8005) + MinIO (:8006/:8007)
cp .env.example .env        # set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm db:generate && pnpm db:migrate
pnpm --filter @headless-lms/api seed   # optional random data
pnpm dev                    # api :8000 · admin :8001 · student :8002
```

## Scripts

| Script | Action |
| --- | --- |
| `pnpm dev` | run all apps in parallel |
| `pnpm build` / `pnpm test` / `pnpm lint` / `pnpm typecheck` | across all workspaces |
| `pnpm db:generate` / `pnpm db:migrate` | drizzle-kit against the root `.env` |
| `pnpm gen:sdk` | regenerate OpenAPI spec + SDK (database must be up) |
