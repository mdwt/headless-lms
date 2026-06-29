# Headless LMS — Architecture

## Overview

A headless LMS: student UI + (eventual) checkout, bring-your-own-funnel. REST API, TypeScript, Postgres. No website builder.

> **Build state.** This document describes both the intended design and what is built today. Contexts are tagged **built**, **in-memory** (working, but backed by an in-memory repo until its schema is finished), **stub**, or **deferred**. The persisted, working core today is **organizations**, **identity**, and **assets** (plus the Better Auth integration and an OAuth/OIDC provider); most other contexts are in-memory or stubs.

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
  - **Repository** — persistence the context needs without knowing the DB (e.g. `OrganizationRepository`). The interface lives in `core/<ctx>/ports.ts`; the implementation lives in `adapters/db/repositories/` (Drizzle) or `adapters/inmemory/`.
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

**Built & persisted**
- **organizations** — org/tenancy, membership, role/permission matrix, course assignments. Source of truth is Better Auth's organization plugin, mirrored into core via hooks. Persisted (`organizations`, `memberships`, `invitations`, `course_assignments`).
- **identity** — the domain student record, mirrored from Better Auth (the user system of record) via a user-create hook. Persisted (`students`).
- **assets** — uploads & content storage: presigned PUT/GET via the object-storage (MinIO/S3) adapter. Persisted (`assets`).

**Built, in-memory** (working behavior; schema not yet built out)
- **team** — org member & role management: invite / change-role / remove, with the rule "the owner role cannot be reassigned". This is the operational member-management surface; `organizations` itself only mirrors Better Auth.
- **enrollments** — access granting: `grant` / `list` / `setStatus`; status `active | expired | revoked`; source `manual | purchase | import`. This is the live surface for what the `entitlements` doc describes.
- **modules** — curriculum structure under a course: `Module` + `ModuleItem` (lesson | assessment-authoring stub); reorder / save / delete.
- **courses** — course *metadata* (title, slug, status, category, instructor, counts). The Module → Lesson structure lives in **modules**; drip/unlock rules are not built. Schema is a stub.

**Read-models** (in-memory, cross-context projections — not bounded contexts)
- **students** — back-office list/projection over `identity` (enrollment count, average progress).
- **dashboard** — cross-context overview stats.

**Stub** (placeholder service + `id`/`org_id` schema only)
- **entitlements** — intended owner of access truth; currently empty. Real behavior lives in **enrollments**.
- **progress** — intended per-student completion of curriculum items; currently empty.

**Deferred** (specified, not built)
- **offers** — what's sold, pricing.
- **billing** — payment, orders, transactions.

**Cross-cutting**
- **shared** — cross-cutting ports (Clock, EventBus, Logger, EmailSender, ObjectStorage).

> **Current scope: no billing.** Offers and billing are deferred. Access is granted directly via **enrollments** (`grant`, for comp / manual / import), with no order or payment. The `offers`/`billing` docs describe the eventual paid flow; they are not built now.

Money (billing), access (entitlements/enrollments), and content (courses/modules) are separate concerns. A payment and an entitlement are not 1:1 — comps, manual grants, and refunds break the mapping. Authorization (team roles, owned by organizations) and access (student enrollments) are also separate: roles govern managing the platform; enrollments govern consuming content.

## Layout

```
apps/api/src/
  core/                 # framework- and persistence-free domain, one folder per context
    organizations/  identity/  assets/  team/  enrollments/  modules/
    courses/  students/  dashboard/  entitlements/  progress/  offers/  billing/
    shared/             # cross-cutting ports
    # each context: service.ts model.ts types.ts events.ts ports.ts index.ts service.test.ts

  adapters/             # outbound infra; implement core ports
    db/
      index.ts          # drizzle client + pool
      schema/           # Drizzle tables, one file per context (the migration source)
      repositories/     # Drizzle repository implementations
    inmemory/           # in-memory repositories (back-office contexts, until schemas land)
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

Persistence is **not** in core: a context's Drizzle table lives in `adapters/db/schema/<ctx>.ts` and its repository implementation in `adapters/db/repositories/<ctx>.ts` (or `adapters/inmemory/<ctx>.ts`).

## Adapters

- **auth** (Better Auth) — the user **system of record**. Email/password + magic link; an organization plugin (roles, members, invitations); and an **OAuth/OIDC provider** (dynamic client registration, scopes, `/.well-known/oauth-*` discovery endpoints). It mirrors users → `identity` and orgs → `organizations` via hooks, resolving auth ids → domain student ids before calling core. *(MCP tools over this provider are specced but not built.)*
- **db** — Drizzle + Postgres; owns the connection pool.
- **storage** — MinIO / S3-compatible; presigned upload/download for `assets`.
- **email / payment / video** — stub adapters (no real transport yet).
- **events** — in-process event bus.
- **inmemory** — in-memory repositories for the back-office contexts.

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

TypeScript does not enforce module boundaries at runtime. A boundary linter (`.eslintrc.cjs`, `eslint-plugin-boundaries` + scoped `no-restricted-imports`) enforces: a context may import another context only via its public `index.ts`; `core/` may not import `adapters/`, inbound, wiring, or `drizzle-orm`; `adapters/` may import `core/` ports only. Violations fail CI.
