# Headless LMS — Architecture

## Overview

A headless LMS: student UI + (eventual) checkout, bring-your-own-funnel. REST API, TypeScript, Postgres. No website builder.

All six domains are built and Drizzle-persisted against real Postgres schema.

## Architecture

**Hexagonal core, organized into bounded contexts.**

- The **core** holds all business logic and depends on nothing outward. It is framework-free **and persistence-free** (the boundary linter forbids `drizzle-orm` in `core/`).
- The core is split into **bounded contexts** (not technical layers). Each is self-contained and exposes one public surface.
- Contexts talk to each other **service-to-service**, through public surfaces only — never reaching into another context's internals.
- External dependencies (Postgres, Better Auth, object storage, email, payment, video) sit **outside** the core as adapters, behind ports the core defines.
- Inbound entry points (HTTP; CLI/workers/cron are placeholders) call into context services; they own no business logic.

### Ports

A context defines its own ports. The service sits in the middle: it **implements** its inbound ports and **depends on** its outbound ports.

- **Inbound port** — the use-case interface the context *offers*. The **service implements it**; callers (HTTP, the auth adapter) depend on it, not the concrete service. E.g. `IdentityService.registerStudent` is the inbound port the HTTP layer and auth hooks call.
- **Outbound port** — something the context *needs*. The **service depends on it**; an adapter or another context's public service implements it. Injected at composition. Two kinds:
  - **Repository** — persistence the context needs without knowing the DB (e.g. `OrganizationRepository`). The interface lives in `core/<ctx>/ports.ts`; the Drizzle implementation lives in `adapters/db/repositories/`.
  - **Capability from elsewhere** — the slice it needs from another context, named by the consumer (e.g. `StudentProvisioner { registerStudent() }`, which the auth adapter depends on and `identity` satisfies).

A context never defines a port into another context's internals — only its public surface.

### Use cases

- A use case is a method on the owning context's service.
- Single-context use case → method on that context's service.
- A use case spanning contexts → lives in the context whose responsibility it is, calling the others' public services. No orchestration tier above the contexts.

### Communication

- **Synchronous** (need a result now, e.g. create-then-use) → direct call to the other context's public service.
- **Decoupled fan-out** (react-after) → event bus; consumers call context services. The auth adapter also drives core directly via Better Auth database/organization hooks (mirroring users → `identity`, orgs → `organizations`).

## Contexts

Six domains, all built and Drizzle-persisted.

- **identity** — user identity and authentication only. Owns the domain user record other contexts reference by id; mirrors Better Auth (the credentials/session system of record) via hooks. No org/membership/roles.
- **organizations** — the tenant root every org-scoped context FKs to. Owns Organization, Membership, Invitation, the role/permission matrix (`owner | admin | instructor | student`; instructor course-scoped), course assignments, and the member-management operations (invite / change-role / remove / list). Better Auth's organization plugin is the source of truth, mirrored read-only via `organizationHooks`; writes go through Better Auth via the `OrgAdmin` port.
- **courses** — the curriculum aggregate: Course (root) → Module → Item → Lesson, drip/unlock rules, and the module/item editor write surface. Lessons are `video | text | pdf | audio | download | embed`; assessment items are typed authoring slots (`quiz | assignment`). References assets by `assetId`.
- **entitlements** — access grants: a student↔course access grant, its status (`active | expired | revoked`) and source (`manual | import`). Use cases `grant` / `list` / `setStatus`. The grant references the course by id directly. Access ≠ completion.
- **progress** — per-student completion records and derived percentage against the course's current structure. Direct (presentational lessons) and event-driven (an optional future outcome-event source) completion. References courses items + identity user by id.
- **assets** — the org media library: a registry row per stored object, served via short-lived presigned URLs over the object-storage (MinIO/S3) adapter. Org-scoped.

**Cross-cutting**
- **shared** — cross-cutting ports (Clock, EventBus, Logger, EmailSender, ObjectStorage).

### Reporting read layer

`apps/api/src/reporting/` — a read-side outside the domains that composes cross-context reads. It calls each context's public service and assembles views (`reporting/students/`, `reporting/dashboard/`); it owns no data and no rules. It lives outside `core/` because a domain depends on nothing outward, whereas reporting reads many domains' public surfaces — the one privilege domains can't have. See `docs/domain/reporting.md`.

## Layout

```
apps/api/src/
  core/                 # framework- and persistence-free domain, one folder per context
    identity/  organizations/  courses/  entitlements/  progress/  assets/
    shared/             # cross-cutting ports
    # each context: service.ts model.ts types.ts events.ts ports.ts index.ts service.test.ts

  reporting/            # cross-context read layer (sibling of core/); composes domain public services
    students/  dashboard/

  adapters/             # outbound infra; implement core ports
    db/
      index.ts          # drizzle client + pool
      schema/           # Drizzle tables, one file per context (the migration source)
      repositories/     # Drizzle repository implementations
    auth/               # Better Auth: user SoR, org plugin, OAuth/OIDC provider
    storage/            # MinIO / S3-compatible object storage (presigned URLs)
    email/  payment/  video/   # stubs
    events/             # event bus impl

  composition/
    container.ts        # wires adapters + services; starts nothing
    config.ts           # reads env into the container config

  http/                 # fastify: server.ts + routes/ per context (Zod-validated)
  cli/  workers/  cron/  # placeholders
```

Better Auth's own tables (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `oauth_*`) live in `adapters/auth/schema.ts` and are scanned by drizzle-kit alongside the domain schema.

### Per-context files (`core/<ctx>/`)

- **service.ts** — use cases / business logic.
- **model.ts** — entities / value objects.
- **types.ts** — DTOs, inputs/outputs.
- **events.ts** — events it publishes.
- **ports.ts** — interfaces it depends on (its repository port + capabilities it needs).
- **index.ts** — public surface; the only thing other contexts may import.
- **service.test.ts** — unit tests.

Persistence is **not** in core: a context's Drizzle table lives in `adapters/db/schema/<ctx>.ts` and its repository implementation in `adapters/db/repositories/<ctx>.ts`.

## Adapters

- **auth** (Better Auth) — the user **system of record**. Email/password + magic link; an organization plugin (roles, members, invitations); and an **OAuth/OIDC provider** (dynamic client registration, scopes, `/.well-known/oauth-*` discovery endpoints). It mirrors users → `identity` and orgs → `organizations` via hooks, resolving auth ids → domain student ids before calling core. *(MCP tools over this provider are specced but not built.)*
- **db** — Drizzle + Postgres; owns the connection pool.
- **storage** — MinIO / S3-compatible; presigned upload/download for `assets`.
- **email / payment / video** — stub adapters (no real transport yet).
- **events** — in-process event bus.

## Inbound & API surface

- **Fastify** HTTP server; one route module per context under `http/routes/`.
- Request/response shapes come from a **shared Zod contract** (`packages/api-contract`). `@fastify/swagger` turns those schemas into an **OpenAPI** document, from which the typed client (`packages/sdk`) is generated (`pnpm gen:sdk`). The `admin` and `student`/`web` apps consume the SDK.
- Better Auth is mounted at `/api/auth/*`; OAuth discovery lives at the root `/.well-known/*`.

## Apps & packages

- **apps/api** — the Fastify backend (this document).
- **apps/admin** — Next.js admin/instructor dashboard.
- **apps/student** — Next.js student course platform (dashboard + course player).
- **apps/web** — older Vite student shell; overlaps `apps/student` (one should eventually be retired).
- **packages/** — `api-contract` (Zod contract), `sdk` (generated client), `shared-types`.

### Dependency direction

- entry points (`http`, `cli`, `workers`, `cron`) → `composition` → `core`
- `adapters` → `core` (via ports)
- core points nowhere outward

### Wiring

`composition/container.ts` builds the object graph: instantiate adapters, build each context's service (injecting its repository + any other context's public service), in dependency order. It starts nothing. Each entry point imports the container, pulls services, and starts its own process.

## Boundaries

TypeScript does not enforce module boundaries at runtime. A boundary linter (`.eslintrc.cjs`, `eslint-plugin-boundaries` + scoped `no-restricted-imports`) enforces: a context may import another context only via its public `index.ts`; `core/` may not import `adapters/`, inbound, wiring, `reporting/`, or `drizzle-orm`; `adapters/` may import `core/` ports only. Violations fail CI.

**Reporting rules:** `reporting/` may import any `core/<ctx>/index.ts` public surface (the only place allowed to read multiple contexts); it may not import `adapters/`, `http/`, or a context's internals. `core/` may not import `reporting/`. Inbound (`http/`) and `composition/` may import `reporting/`.
