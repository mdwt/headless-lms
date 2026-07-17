# Headless LMS — Architecture

## Overview

A headless LMS: student UI + (eventual) checkout, bring-your-own-funnel. REST API, TypeScript, Postgres. No website builder.

The backend ships as a library — `@headless-lms/server` (`packages/server`). An
installation composes it with its own config and integration plugins; `apps/api`
is this repo's installation, and `create-headless-lms` scaffolds standalone ones.
All seven contexts are built and Drizzle-persisted against real Postgres schema.

## Architecture

**Hexagonal core, organized into bounded contexts.**

- The **core** holds all business logic and depends on nothing outward. It is framework-free **and persistence-free** (the boundary linter forbids `drizzle-orm` in `core/`).
- The core is split into **bounded contexts** (not technical layers). Each is self-contained and exposes one public surface.
- Contexts talk to each other **service-to-service**, through public surfaces only — never reaching into another context's internals.
- External dependencies (Postgres, Better Auth, object storage, email, video) sit **outside** the core as adapters, behind ports the core defines.
- The inbound entry point (HTTP, including the MCP endpoint) calls into context services; it owns no business logic. The `headless-lms` CLI lives in its own package (`@headless-lms/cli`) and calls the server's exported operational functions.

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

Seven domains.

- **identity** — user identity and authentication only. Owns the domain user record other contexts reference by id; mirrors Better Auth (the credentials/session system of record) via hooks. No org/membership/roles.
- **organizations** — the tenant root every org-scoped context FKs to. Owns Organization, Membership, Invitation, the role/permission matrix (`owner | admin | instructor | student`; instructor course-scoped), course assignments, and the member-management operations (invite / change-role / remove / list). Better Auth's organization plugin is the source of truth, mirrored read-only via `organizationHooks`; writes go through Better Auth via the `OrgAdmin` port.
- **content** — the org's authored content, home of all content types. Today one type: **course** — Course (root) → Module → Activity, drip/unlock rules, and the authoring write surface. An activity is a unit of content with a settings blob and asset links. See `docs/domain/content.md`.
- **entitlements** — access grants: a student↔course access grant, its status (`active | expired | revoked`) and source (`manual | import`). Use cases `grant` / `list` / `setStatus`. The grant references the course by id directly. Access ≠ completion.
- **progress** — per-student completion records and derived percentage against the content's current structure. References content activities + identity user by id.
- **assets** — the org media library: a registry row per stored object, served via short-lived presigned URLs over the object-storage (MinIO/S3) adapter. Org-scoped.
- **integrations** — third-party integration connections: which integrations an org has connected, their validated config/secrets, and dispatching domain events + actions to them. The integration *implementations* are plugins outside core (see Layout). See `docs/domain/integrations.md`.

**Cross-cutting**
- **shared** — cross-cutting ports (Clock, EventBus, Logger, EmailSender, ObjectStorage).

### Reporting read layer

`packages/server/src/reporting/` — a read-side outside the domains that composes cross-context reads. It calls each context's public service and assembles views (`reporting/students/`, `reporting/dashboard/`); it owns no data and no rules. It lives outside `core/` because a domain depends on nothing outward, whereas reporting reads many domains' public surfaces — the one privilege domains can't have. See `docs/domain/reporting.md`.

## Layout

```
packages/server/src/
  core/                 # framework- and persistence-free domain, one folder per context
    identity/  organizations/  content/  entitlements/  progress/  assets/  integrations/
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
    email/  video/      # stubs
    events/             # event bus impl

  composition/
    container.ts        # wires adapters + services; starts nothing
    integrations.ts     # loadIntegrations — scans the installation's pluginsDir
    migrate.ts seed.ts  # operational functions, wrapped by @headless-lms/cli

  http/                 # fastify: server.ts + routes/ per resource (Zod-validated)
    mcp/                # MCP endpoint (OAuth bearer auth, outside the session guard)
    plugins/            # fastify plugins: auth/session, cors, error handler, openapi

  index.ts              # public surface: createContainer, buildServer, runMigrations, runSeed, types
```

An installation (`apps/api/src/`) adds only `config.ts`, `main.ts`, and
`plugins/` — one folder per third-party integration (directory name =
integration id), each default-exporting the `Integration` contract from
`@headless-lms/types`; `slack/` is a thin re-export of `plugins/slack`
(the workspace package).

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

- **auth** (Better Auth) — the user **system of record**. Email/password + magic link; an organization plugin (roles, members, invitations); and an **OAuth/OIDC provider** (dynamic client registration, scopes, `/.well-known/oauth-*` discovery endpoints). It mirrors users → `identity` and orgs → `organizations` via hooks, resolving auth ids → domain student ids before calling core. The MCP endpoint (`http/mcp/`) authenticates against this provider via OAuth bearer tokens.
- **db** — Drizzle + Postgres; owns the connection pool.
- **storage** — MinIO / S3-compatible; presigned upload/download for `assets`.
- **email / video** — stub adapters (no real transport yet).
- **events** — in-process event bus.

## Inbound & API surface

- **Fastify** HTTP server; one route module per resource under `http/routes/`, all mounted inside a session-guarded plugin (`http/routes.ts`) so a new route cannot accidentally ship public.
- Request/response shapes come from a **shared Zod contract** (`packages/api-contract`). `@fastify/swagger` turns those schemas into an **OpenAPI** document, from which the typed client (`packages/sdk`) is generated (`pnpm gen:sdk`). The `admin` and `student` apps consume the SDK.
- The **MCP endpoint** (`http/mcp/`) sits outside the session guard and authenticates via OAuth bearer tokens.
- Better Auth is mounted at `/api/auth/*`; OAuth discovery lives at the root `/.well-known/*`.

## Apps & packages

- **packages/server** — the backend as a library (this document).
- **apps/api** — this repo's installation of the server (config, entry point, plugins).
- **apps/admin** — Next.js admin/instructor dashboard.
- **apps/student** — Next.js student course platform (dashboard + course player).
- **packages/** — `cli` (the `headless-lms` bin), `create-headless-lms` (installation scaffolder), `api-contract` (Zod contract), `sdk` (generated client), `types` (domain types, events & integration contract), `utils` (integration runtime helpers). See `project-structure.md`.
- **plugins/** — integration workspace packages: `slack` (`@headless-lms/plugin-slack`).

### Dependency direction

- entry points (`http`; the cli package via the server's public surface) → `composition` → `core`
- `adapters` → `core` (via ports)
- core points nowhere outward

### Wiring

`composition/container.ts` builds the object graph: instantiate adapters, build each context's service (injecting its repository + any other context's public service), in dependency order. It starts nothing. Each entry point imports the container, pulls services, and starts its own process.

## Boundaries

TypeScript does not enforce module boundaries at runtime. A boundary linter (`.eslintrc.cjs`, `eslint-plugin-boundaries` + scoped `no-restricted-imports`) enforces: a context may import another context only via its public `index.ts`; `core/` may not import `adapters/`, inbound, wiring, `reporting/`, or `drizzle-orm`; `adapters/` may import `core/` ports only. Violations fail CI.

**Reporting rules:** `reporting/` may import any `core/<ctx>/index.ts` public surface (the only place allowed to read multiple contexts); it may not import `adapters/`, `http/`, or a context's internals. `core/` may not import `reporting/`. Inbound (`http/`) and `composition/` may import `reporting/`.
