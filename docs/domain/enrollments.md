# Enrollments — Domain Spec

> **Build state:** implemented in-memory. This is the live surface for the access-granting behavior the **entitlements** spec describes; `core/entitlements` itself is an empty stub.

Owns the operational grant of a student's access to a course — the running list of who is enrolled, in what state, from what source.

## Scope

- Owns the **enrollment**: a student↔course access grant, its status, and where it came from.
- Owns the `grant` / `list` / `setStatus` use cases.
- Does **not** own money (billing), content (courses), or completion (progress reads through `progressPercent` only).

## Model

- **Enrollment** — id, student (id, name, email), course (id, title), `status`, `progressPercent`, `grantedAt`, `expiresAt` (nullable = lifetime), `source`.
- **Status** — `active | expired | revoked`.
- **Source** — `manual | purchase | import`. How the grant originated; `manual` is the comp/direct path, `purchase` the eventual billing path, `import` a bulk load.

## Key operations

- **`grant`** — create an enrollment for a student on a course, with an optional `expiresAt`.
- **`list`** — paged/filtered query (search, sort, `status`, `source`, `studentId`, `courseId`).
- **`setStatus`** — revoke or reinstate (`active | revoked`).

## Boundaries

1. **enrollments ↔ entitlements** — enrollments is the implemented surface for the entitlement/access concept; the entitlements spec is the eventual home for the richer access-resolution model.
2. **enrollments ↔ identity / courses** — references the student and course by id; denormalizes name/email/title onto the row for list rendering.

## Build state

In-memory repository (no persistence, no events emitted). `grant`, `list`, `setStatus` delegate straight to the repo via `EnrollmentsServiceImpl`.
