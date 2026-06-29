# Headless LMS — Architecture

## Overview

A headless LMS: student UI + checkout, bring-your-own-funnel. REST API, TypeScript, Postgres. No website builder.

## Architecture

**Hexagonal core, organized into bounded contexts.**

- The **core** holds all business logic and depends on nothing outward.
- The core is split into **bounded contexts** (not technical layers). Each is self-contained and exposes one public surface.
- Contexts talk to each other **service-to-service**, through public surfaces only — never reaching into another context's internals.
- External dependencies (DB, Stripe, email, video) sit **outside** the core as adapters, behind ports the core defines.
- Inbound entry points (HTTP, CLI) and triggers (workers, cron) call into context services; they own no business logic.

### Ports

A context defines its own ports. The service sits in the middle: it **implements** its inbound ports and **depends on** its outbound ports.

- **Inbound port** — the use-case interface the context *offers*. The **service implements it**; callers (HTTP, workers) depend on it, not the concrete service. E.g. `EnrollOnPurchase` ← implemented by `EntitlementService`.
- **Outbound port** — something the context *needs*. The **service depends on it**; an adapter or another context's public service implements it. Injected at composition. Two kinds:
  - **Repository** — persistence the context needs without knowing the DB (e.g. `EntitlementRepository`).
  - **Capability from elsewhere** — the slice it needs from another context, named by the consumer (e.g. `OfferLookup { get(offerId) }`), satisfied by that context's public service.

A context never defines a port into another context's internals — only its public surface.

### Use cases

- A use case is a method on the owning context's service.
- Single-context use case → method on that context's service.
- A use case spanning contexts → lives in the context whose responsibility it is, calling the others' public services. No orchestration tier above the contexts.

### Communication

- **Synchronous** (need a result now, e.g. create-then-use) → direct call to the other context's public service.
- **Decoupled fan-out** (react-after, e.g. post-checkout) → event bus; workers consume and call context services.

## Contexts

- **organizations** — org/tenancy, membership, team roles, course assignments. Source of truth is Better Auth's organization plugin, mirrored into core via database hooks.
- **identity** — the domain user/student, mirrored from Better Auth (the user system of record). Auth + the domain user record only.
- **courses** — content structure: Course → Module → Lesson, curriculum items.
- **assessment** — quizzes/assignments, attempts. Owns outcome; emits to progress.
- **entitlements** — access truth: who can access what, validity. Owns the enrollment record and the `enroll()` use case.
- **progress** — per-student completion of curriculum items; derived progress.
- **offers** — what's sold, pricing. **Deferred** — not implemented yet.
- **billing** — payment, orders, transactions. **Deferred** — not implemented yet.

> **Current scope: no billing.** Offers and billing are specified but deferred. Enrollment happens **by grant only** — `entitlements.enroll()` creates access directly (comp / manual / free), with no order or payment. The `offers`/`billing` specs and their boundaries to entitlements describe the eventual paid flow; they are not built now.

Money (billing), access (entitlements), content (courses), completion (progress), and outcome (assessment) are separate concerns. A payment and an entitlement are not 1:1 — comps, manual grants, and refunds break the mapping. Completion (progress) and outcome (assessment) are distinct: assessment owns whether a student passed; progress owns whether an item is complete.

Authorization (team roles, owned by organizations) and access (student entitlements) are also separate: roles govern managing the platform; entitlements govern consuming content.

## Layout

```
src/
  core/
    organizations/    service.ts repository.ts model.ts types.ts events.ts ports.ts index.ts
    identity/
    courses/
    assessment/
    entitlements/
    progress/
    offers/
    billing/

  adapters/
    db/               # drizzle client, connection (own pool)
    payment/          # stripe
    email/
    video/            # host / transcode
    storage/          # s3 / files
    events/           # event bus impl

  composition/
    container.ts      # wires adapters + services; starts nothing

  http/               # fastify: server.ts + routes per context
  cli/
  workers/            # queue consumers (trigger -> context service)
  cron/
```

### Per-context files

- **service.ts** — use cases / business logic.
- **repository.ts** — data access for this context's tables; private.
- **model.ts** — entities / value objects.
- **types.ts** — DTOs, inputs/outputs.
- **events.ts** — events it publishes.
- **ports.ts** — interfaces it depends on (its repo, capabilities it needs).
- **index.ts** — public surface; the only thing other contexts may import.

### Dependency direction

- entry points (`http`, `cli`, `workers`, `cron`) → `composition` → `core`
- `adapters` → `core` (via ports)
- core points nowhere outward

### Wiring

`composition/container.ts` builds the object graph: instantiate adapters, build each context's service (injecting its repo + any other context's public service), in dependency order. It starts nothing. Each entry point imports the container, pulls services, and starts its own process.

## Boundaries

TypeScript does not enforce module boundaries at runtime. Enforce "no deep imports across contexts" with a boundary linter so cross-context access stays on the public surface.
