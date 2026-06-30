# Entitlements — Domain Spec

Owns access truth: the student↔course access grant, its validity, and its lifecycle. The grant references the course directly and is distinct from completion. This context absorbed the former `enrollments` surface.

## Scope

- Owns the **access grant**: a student↔course grant, its status, and its source.
- Owns granting access, listing grants, and changing a grant's status (revoke / reinstate).
- The grant references the course.
- Access ≠ completion: a grant and progress move independently.
- Does **not** own money, content (courses), or completion (progress).

## Capabilities
- Grant access — enroll a student in a course, with an optional expiry.
- List grants — browse and filter enrollments by student, course, status, or source.
- Change status — revoke a grant or reinstate a revoked one.
- Resolve access — answer what a student can open right now (see Access resolution).

## Model

- **Enrollment** — the access grant: the student it is for, the course it grants, its status, its source, when it was granted, and when it expires (nullable = lifetime). Completion is not held here — it belongs to progress.
- **Status** — `active | expired | revoked`.
- **Source** — `manual | import`. How the grant originated; `manual` is the comp/direct path, `import` a bulk load. There is no `purchase` source — entitlements has no billing footprint.

## Access resolution

Entitlements owns the grant and its access start. To resolve what a student can actually open right now, it composes its own grant state with the gating rules in **courses** (drip relative to access start, unlock-on-completion) and the completion state in **progress**. The answer is composed by reading both; entitlements owns neither the rules nor the completion.

## Boundaries

1. **entitlements ↔ identity** — entitlements references the user it grants access to; identity owns that user record.
2. **entitlements ↔ courses** — entitlements references the course it grants and reads its gating rules during access resolution; courses owns the content and those rules.
3. **entitlements ↔ progress** — entitlements reads completion during access resolution but never owns or stores it; progress owns completion.

## Events

- `enrollment.created`
- `enrollment.revoked`
- `enrollment.expired`

## Relationship to progress

Access (entitlements) and completion (progress) move independently — a student can be granted access with zero progress, or have full progress after access has expired. Progress references that access exists; entitlements references completion for gating. Neither owns the other.

## Build state

Built and **persisted** via a Drizzle repository (`adapters/db/repositories/entitlements.ts`).
