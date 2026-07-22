# Entitlements — Domain Spec

Owns access truth: the student↔content access grant, its validity, and its lifecycle. The grant is **generic over content types** (course today; podcast, membership, … later): it references content by its identity, whatever the type, so one grant concept serves all content. Distinct from completion. This context absorbed the former `enrollments` surface.

## Scope

- Owns the **access grant**: a student↔content grant, its status, and its source.
- Owns granting access, listing grants, and changing a grant's status (revoke / reinstate).
- The grant references content by its identity (see the content domain spec).
- Access ≠ completion: a grant and progress move independently.
- Does **not** own money, content, or completion (progress).

## Capabilities
- Grant access — entitle a student to a piece of content, with an optional expiry.
- List grants — browse and filter entitlements by student, content, content type, status, or source.
- Change status — revoke a grant or reinstate a revoked one.
- Resolve access — answer what a student can open right now (see Access resolution).

## Model

- **Entitlement** — the access grant: the student it is for, a reference to the content it grants (identity, type, and display name), its status, its source, when it was granted, and when it expires (nullable = lifetime). Completion is not held here — it belongs to progress.
- **Status** — `active | expired | revoked`. `expired` is not a transition anyone performs — it follows from the expiry date having passed.
- **Source** — free text (`manual`, `import`, integration ids, …). How the grant originated; defaults to `manual`. There is no `purchase` source — entitlements has no billing footprint.
- **Uniqueness** — one grant per student per piece of content, within an org. Identical for every content type.

Entitlement semantics are uniform across all content types: same lifecycle, same expiry rule, same uniqueness. The only per-type variation is which content type the grant points at.

## Access resolution

Entitlements owns the grant and its access start. To resolve what a student can actually open right now, it composes its own grant state with the gating rules in **content** (drip relative to access start, unlock-on-completion) and the completion state in **progress**. The answer is composed by reading both; entitlements owns neither the rules nor the completion.

## Boundaries

1. **entitlements ↔ identity** — entitlements references the student it grants access to; identity owns that record.
2. **entitlements ↔ content** — entitlements references the content it grants and reads its gating rules during access resolution; content owns the content and those rules. Deleting content removes the grants to it.
3. **entitlements ↔ progress** — entitlements reads completion during access resolution but never owns or stores it; progress owns completion.

## Events

- `entitlement.created`
- `entitlement.updated`
- `entitlement.deleted`
- `entitlement.expired`

Each carries the full entitlement snapshot; subscribers can tell content types apart from the content reference it carries.

## Relationship to progress

Access (entitlements) and completion (progress) move independently — a student can be granted access with zero progress, or have full progress after access has expired. Progress references that access exists; entitlements references completion for gating. Neither owns the other.

## Build state

Built and **persisted** via a Drizzle repository (`adapters/db/repositories/entitlements.ts`).
