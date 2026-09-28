# Organizations — Domain Spec

Organizations owns the tenant: the organization itself, everyone who belongs to it, and the role each of them holds. It is the tenant root that every other context scopes to. Better Auth's organization plugin is the source of truth for staff membership; core holds a mirror, and staff membership writes go through Better Auth.

An **org user** links a _person_ (from the identity domain) to an organization under one role. Staff and learners are the same kind of link, distinguished only by role — a learner is an org user whose role is `student`. This is what makes it possible to say "whoever did this" about any actor in an organization without first asking which population they came from.

## Scope

- Owns the **organization (tenant)**, the **org user** (person ↔ org, with a role), the **invite**, and **roles**.
- Owns **authorization** — the mapping from an org user's role to what they may do.
- Owns **member management** — inviting, reassigning, and removing the people who belong to an org, staff and learners alike.
- Does **not** own the person record (identity), learner access (entitlements), content (courses), or completion (progress).

## System of record

Better Auth's **organization plugin** is the source of truth for organizations and members. Invites are domain-owned. Core holds a **read-only mirror** of the auth side, populated from Better Auth's organization lifecycle. Every member write — reassign, remove — goes **through Better Auth**; core never writes the mirror directly, it reads the mirror and reacts to those changes. Because Better Auth is the source of truth, replacing it would be a **data migration, not a swap**.

## Models

- **Organization** — the tenant. The root every org-scoped record belongs to. Mirrors a Better Auth org.
- **Org user** — links a person to an org and carries their role. Never exists without a person behind it. For staff it also mirrors a Better Auth member; learners have no Better Auth membership, so nothing to mirror. Carries a **status**: `invited` for a learner an admin has added who has not yet accepted, `active` once they have.
- **Invite** — a pending invite to join an org. Domain-owned, carrying the role the invitee will hold.

## Roles

Four roles: `owner | admin | instructor | student`. A role answers two questions — what an org user can do, and over which resources.

- **Owner** — full control, including transferring ownership. Org-global. One per org.
- **Admin** — manage courses, members, and settings. Org-global.
- **Instructor** — create and manage courses. **Course-scoped** in principle: the role's grants are narrowed to a subset of courses rather than the whole org. Nothing records that subset today, so a narrowed grant resolves to no access.
- **Student** — consume content. **Entitlement-scoped**: the role grants nothing on its own; what a learner may open is decided by their entitlements.

The first three are the staff roles, and only they reach the back office.

### Permissions

The table-stakes permission map — the starting set, not a fixed contract.

| Action                   | Owner | Admin | Instructor   | Student      |
| ------------------------ | ----- | ----- | ------------ | ------------ |
| Manage org / ownership   | ✓     |       |              |              |
| Manage org settings      | ✓     | ✓     |              |              |
| Manage members           | ✓     | ✓     |              |              |
| Create / edit any course | ✓     | ✓     |              |              |
| Edit assigned course     | ✓     | ✓     | ✓ (assigned) |              |
| View student progress    | ✓     | ✓     | ✓ (assigned) |              |
| Consume content          |       |       |              | ✓ (entitled) |

## Member management

Owners and admins manage who belongs to an org: invite by email and role, reassign a role, and remove an org user. Ownership is held by exactly one org user and moves only through a deliberate ownership transfer, not the ordinary role-reassignment path. Staff writes go through Better Auth and the mirror follows.

### Invites

Inviting a **learner** adds them. The admin names them, and the person and their org user exist from that moment, `invited`, before the invitee has done anything at all. This is what makes a learner findable, grantable and reportable while their invitation is still outstanding — an admin who added someone should not have to wait on them to see them. Accepting activates that same org user rather than making a new one, so anything granted while they were pending survives.

Whether the invitation is emailed is the admin's choice; suppressing delivery changes nothing about the records, only who carries the link.

Inviting **staff** creates nothing but the invitation. Their org user mirrors a Better Auth member, and that member does not exist until they join, so there is nothing to add ahead of time.

## Boundaries

1. **organizations ↔ Better Auth** — the organization plugin is the source of truth; core holds a read-only mirror, and all member writes go through Better Auth.
2. **organizations ↔ identity** — identity owns the person; organizations references them by id on an org user, and that reference is always present. Reference only.
3. **organizations → all contexts** — provides the tenant scope and answers authorization lookups. Reference plus authorization.

## Events

Emitted by core when the mirror updates in response to a Better Auth change (core owns these domain events; Better Auth owns the underlying auth action).

- `organization.created`
- `role.assigned`
- `invite.created`, `invite.accepted`, `invite.canceled`
- org user added and removed
- `student.linked` — a learner added by an admin has attached an account. `student.created` says the org has a record of them; this says they can actually sign in.

## Multi-tenancy

The organization is the tenant root. Every org-scoped record across the system belongs to exactly one organization. People are global; the link between a person and an org is their org user, and it is the target every actor-shaped reference in the system points at.

## Build state

Built and **persisted**.
