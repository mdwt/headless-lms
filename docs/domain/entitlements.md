# Entitlements — Domain Spec

Owns access truth: the student↔course access grant, its validity, and its lifecycle. The grant references the course directly. Distinct from completion. This context absorbed the former `enrollments` surface.

## Scope

- Owns the **access grant**: a student↔course access grant, its status, and its source.
- Owns the `grant` / `list` / `setStatus` use cases (the surface formerly in `enrollments`).
- The grant **references the course by id directly** — no offer, no order.
- Access ≠ completion: a grant and progress move independently.
- Does **not** own money, content (courses), or completion (progress).

## Model

- **Entitlement** — id, student (id, name, email), course (id, title), `status`, `progressPercent`, `grantedAt`, `expiresAt` (nullable = lifetime), `source`. Denormalizes student/course display fields for list rendering.
- **Status** — `active | expired | revoked`.
- **Source** — `manual | import`. How the grant originated; `manual` is the comp/direct path, `import` a bulk load. (`purchase` is dropped — there is no billing footprint.)

## Key operations

- **`grant`** — create an entitlement for a student on a course, with an optional `expiresAt`.
- **`list`** — paged/filtered query (search, sort, `status`, `source`, `studentId`, `courseId`).
- **`setStatus`** — revoke or reinstate (`active | revoked`).

## Boundaries

1. **entitlements → courses/progress (access-resolution)**
   - *entitlements* owns the grant and its access start.
   - To resolve what's unlocked now, it reads *courses* gating rules (drip relative to access start, unlock-on-completion) and *progress* (what's complete).
   - Connection: entitlements composes the answer by reading both.

2. **entitlements ↔ identity**
   - *identity* owns the user.
   - *entitlements* references the user id; denormalizes name/email for list rendering.
   - Connection: reference only.

3. **entitlements ↔ courses**
   - *courses* owns content; *entitlements* references the course by id and denormalizes the title.
   - Connection: reference by id.

## Events

- `entitlement.granted`
- `entitlement.revoked`
- `entitlement.expired`

## Relationship to progress (distinct domains)

Access (entitlements) and completion (progress) move independently: enrolled with zero progress; full progress with expired access. Progress references that access exists; it does not own it. Entitlements references completion (for gating); it does not own it.

## Build state

Built and **persisted** via a Drizzle repository (`adapters/db/repositories/entitlements.ts`), including the absorbed `enrollments` surface.
