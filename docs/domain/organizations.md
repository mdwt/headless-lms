# Organizations — Domain Spec

Organizations owns the tenant: the organization itself, the staff who belong to it, and their roles. It is the tenant root that every other context scopes to. Better Auth's organization plugin is the source of truth; core holds a read-only mirror, and all writes go through Better Auth.

Membership here is **staff only** — it links a *User* (the staff identity from the identity domain) to an org. Learners are the separate Student identity and do not hold org memberships or roles; whether someone is a learner is determined by their entitlements, not by anything in this domain.

## Scope

- Owns the **organization (tenant)**, **membership** (staff User ↔ org), **invitation**, **roles**, and **course assignments** (which scope an instructor to specific courses).
- Owns **authorization** — the mapping from a member's role to what they may do.
- Owns **member management** — inviting, reassigning, and removing the staff who belong to an org.
- Does **not** own the user record (identity), learner access (entitlements), content (courses), or completion (progress).

## System of record

Better Auth's **organization plugin** is the source of truth for organizations, members, and invitations. Core holds a **read-only mirror**, populated from Better Auth's organization lifecycle. Every member write — invite, reassign, remove — goes **through Better Auth**; core never writes the mirror directly, it reads the mirror and reacts to those changes. Because Better Auth is the source of truth, replacing it would be a **data migration, not a swap**.

## Models

- **Organization** — the tenant. The root every org-scoped record belongs to. Mirrors a Better Auth org.
- **Membership** — links a staff User to an org and carries their role. Mirrors a Better Auth member.
- **Invitation** — a pending invite to join an org. Mirrors a Better Auth invitation.
- **Course assignment** — links an instructor's membership to a specific course, which is how an instructor's permissions are scoped to the courses they actually teach.

## Roles

Three staff roles: `owner | admin | instructor`. A role answers two questions — what a member can do, and over which resources.

- **Owner** — full control, including transferring ownership. Org-global. One per org.
- **Admin** — manage courses, members, and settings. Org-global.
- **Instructor** — create and manage the courses assigned to them. **Course-scoped** through a course assignment.

Learners are not represented here; they are the Student identity and are governed by entitlements, not by an org role.

### Permissions

The table-stakes permission map — the starting set, not a fixed contract.

| Action | Owner | Admin | Instructor |
|---|---|---|---|
| Manage org / ownership | ✓ | | |
| Manage org settings | ✓ | ✓ | |
| Manage members | ✓ | ✓ | |
| Create / edit any course | ✓ | ✓ | |
| Edit assigned course | ✓ | ✓ | ✓ (assigned) |
| View student progress | ✓ | ✓ | ✓ (assigned) |

## Member management

Owners and admins manage who belongs to an org: invite staff by email and role, reassign a member's role, and remove a member. Ownership is held by exactly one member and moves only through a deliberate ownership transfer, not the ordinary role-reassignment path. All of these are writes, so they go through Better Auth and the mirror follows.

## Boundaries

1. **organizations ↔ Better Auth** — the organization plugin is the source of truth; core holds a read-only mirror, and all member writes go through Better Auth.
2. **organizations ↔ identity** — identity owns the User record; organizations references the User by id on membership and course assignment. Reference only.
3. **organizations ↔ courses** — a course assignment references a course by id to scope an instructor; organizations never reads course content. Reference only.
4. **organizations → all contexts** — provides the tenant scope and answers authorization lookups. Reference plus authorization.

## Events

Emitted by core when the mirror updates in response to a Better Auth change (core owns these domain events; Better Auth owns the underlying auth action).

- `organization.created`
- `membership.created`, `role.assigned`
- `invitation.created`, `invitation.accepted`

## Multi-tenancy

The organization is the tenant root. Every org-scoped record across the system belongs to exactly one organization. Users are global; the link between a user and an org is the membership.

## Build state

Built and **persisted**.
