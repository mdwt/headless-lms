# Entitlements — Domain Spec

Owns access truth: the student↔content access grant, its validity, and its lifecycle. The grant is **generic over content types** (course and download today; community with the community feature; event, podcast, … later): it references content by its identity, whatever the type, so one grant concept serves all content. A grant can also target a **bundle**, and then it is access to every item in it. Distinct from completion. This context absorbed the former `enrollments` surface. A person's place in a by-request or by-invite community space is a **space member**, owned here and not a grant.

## Scope

- Owns the **access grant**: a student↔content grant, its status, and its source.
- Owns the **space member**: a person's place in one by-request or by-invite community space. Not a grant.
- Owns granting access, listing grants, and changing a grant's status (revoke / reinstate).
- The grant references content by its identity, or a bundle by its identity (see the content domain spec).
- Access ≠ completion: a grant and progress move independently.
- Does **not** own money, content, or completion (progress).

## Capabilities

- Grant access — entitle a student to a piece of content, with an optional expiry.
- List grants — browse and filter entitlements by student, content, content type, status, or source.
- Change status — revoke a grant or reinstate a revoked one.
- Resolve access — answer what a student can open right now (see Access resolution).
- Space membership — request, invite, approve, accept, decline, leave and remove a person's place in a by-request or by-invite space, and enforce that space's capacity.

## Model

- **Entitlement** — the access grant: the student it is for, a reference to the content it grants (identity, type, and display name), its status, its source, when it was granted, and when it expires (nullable = lifetime). Completion is not held here — it belongs to progress.
- **Status** — stored as `active | revoked`. The resolved status a reader returns is `active | expired | revoked`. `expired` is not a transition anyone performs and is not stored — it follows from `expires_at` having passed. Anything that is not `revoked` and not past `expires_at` resolves as active.
- **Source** — free text (`manual`, `import`, integration ids, …). How the grant originated; defaults to `manual`. There is no `purchase` source — entitlements has no billing footprint.
- **Target** — exactly one of a content item or a bundle. A grant to a bundle gives access to every item in the bundle for as long as the grant is active. The items are read from content when access is resolved, never copied onto the grant, so changing what's in the bundle changes what the grant opens.
- **Uniqueness** — one grant per student per piece of content or bundle, within an org. Identical for every content type.

Entitlement semantics are uniform across all content types: same lifecycle, same expiry rule, same uniqueness. The only per-type variation is which content type the grant points at. A community grant is that same grant. `requested` and `invited` are not grant statuses.

- **Space member** — one person's place in one by-request or by-invite space, on top of a grant to the community. Status `requested | invited | active | revoked`. A request is `requested` and approval sets `active`. An invitation is `invited` and acceptance sets `active`. Declining, refusing and leaving delete the row. Removal sets `revoked`. An all-members space has no space members. The row carries the community id. Capacity is enforced on approval and acceptance by locking the space through content in the same transaction and counting active rows.

## Access resolution

Entitlements is the only authority on whether a student can open a piece of content. Every other context, the learner surface and every report asks entitlements; none reads grants and decides for itself.

A student can open a piece of content when they hold an active grant to it, or an active grant to a bundle that currently holds it. Active is one rule everywhere: not revoked and not past its expiry.

A bundle grant is resolved against the bundle's current items each time access is asked, never copied into one grant per item:

- A bundle's items change after it is granted. An item added reaches every holder at once, and an item removed leaves every holder at once, with nothing to backfill or clean up.
- Revoking or expiring the bundle grant ends access to everything it opened in one step.
- A student can hold a grant to a course and to a bundle containing it at the same time. Revoking one leaves the access the other gives.
- The grant keeps recording what was granted, the bundle, rather than a list of items.

Entitlements owns the grant and its access start. To resolve what a student can actually open right now, it composes its own grant state with the gating rules in **content** (drip relative to access start, unlock-on-completion) and the completion state in **progress**. The answer is composed by reading both; entitlements owns neither the rules nor the completion.

## Boundaries

1. **entitlements ↔ organizations** — entitlements references the _org user_ it grants access to, not the person: a grant is access within one organization, and the same person entitled in two organizations holds two independent grants. Organizations owns that record.
2. **entitlements ↔ content** — entitlements references the content or bundle it grants, reads a bundle's items and the content's gating rules during access resolution; content owns the content, the bundle and those rules. Deleting content or a bundle removes the grants to it. A space member references the space. Entitlements reads the space's access rule and capacity through content, and asks content to lock the space row when it checks capacity. Entitlements does not write the space.
3. **entitlements ↔ progress** — entitlements reads completion during access resolution but never owns or stores it; progress owns completion.

## Events

- `entitlement.created`
- `entitlement.updated`
- `entitlement.deleted`
- `entitlement.expired` — emitted by the expiry run. One event per grant whose `expires_at` has passed.
- `entitlement.ending_soon` — the same run, once per grant per community that grant opens, when the grant enters the seven days before `expires_at`. The data is the grant unchanged plus `communityId`.

The expiry run records every emission in its own ledger, one record per grant per term for an expiry and one per grant per community per term for a reminder. The term is the grant's expiry date at the time, so a renewed grant is expired and reminded again for its new term. That is what makes "once" true: within a term a grant is expired once and reminded once per community, however often the run fires and whatever happens to the outbox afterwards. Reminders go only for published communities. The grant row itself does not change.
- `entitlement.space_member.created`
- `entitlement.space_member.updated`
- `entitlement.space_member.deleted` — `metadata.previousStatus` is the status the row had. `requested` is a declined request, `invited` a refused invitation, `active` the member leaving.

Grant events carry the full entitlement snapshot; subscribers can tell content types apart from the content reference it carries. Space member events carry the space member row, including the community id.

## Relationship to progress

Access (entitlements) and completion (progress) move independently — a student can be granted access with zero progress, or have full progress after access has expired. Progress references that access exists; entitlements references completion for gating. Neither owns the other.

## Build state

Grants, space members, the expiry run with its notice ledger, `entitlement.ending_soon`, and the emission of `entitlement.expired` are built and **persisted**.
