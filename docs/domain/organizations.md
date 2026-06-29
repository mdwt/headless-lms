# Organizations — Domain Spec

Owns the tenant: organization, membership, invitation, the role model, course assignments, and member-management operations. The tenant root every other context scopes to. Better Auth's organization plugin is the source of truth, mirrored read-only into core; writes go through Better Auth.

## Scope

- Owns the **org (tenant)**, **membership** (user↔org), **invitation**, **roles**, and **course assignments** (instructor scope).
- Owns **authorization** (role → permission) for members.
- Owns the **member-management operations** (formerly the `team` context): invite a member, change a member's role, remove a member, list members, and the rules on those operations.
- Does **not** own the user record (identity), access (entitlements), content (courses), or completion (progress).

## System of record

Better Auth's **organization plugin** is the source of truth for organizations, members, and invitations. Core holds a **read-only mirror** populated by `organizationHooks` (`afterCreateOrganization`, `afterAddMember`, `afterCreateInvitation`, …) into domain tables. All member writes (invite / change-role / remove) go **through Better Auth** via the `OrgAdmin` port — core never writes the mirror directly. Org-scoped tables across the system carry `org_id` and FK to the mirrored organization. A provider swap is a **data migration, not a port swap**.

## Model

- **Organization** — the tenant. Root every org-scoped table FKs to. Mirrors a Better Auth org.
- **Membership** — links a user to an org with a role. Mirrors a Better Auth member.
- **Invitation** — a pending invite to join an org. Mirrors a Better Auth invitation.
- **Course assignment** — links an instructor membership to a course, scoping instructor permissions to assigned courses.

## Roles

Four roles, defined in code as a string-literal union (stored as a `text` column; **no DB enum**): `owner | admin | instructor | student`. Two axes: **role** (what) × **scope** (over what).

- **Owner** — full control, ownership transfer. Org-global. One per org.
- **Admin** — manage courses, students, settings. Org-global.
- **Instructor** — create/manage assigned courses. **Course-scoped** via a course assignment.
- **Student** — consume content. Default role. Per-membership (access owned by entitlements; the role here is "is a learner").

### Permissions (table stakes)

| Action | Owner | Admin | Instructor | Student |
|---|---|---|---|---|
| Manage org / ownership | ✓ | | | |
| Manage org settings | ✓ | ✓ | | |
| Manage users | ✓ | ✓ | | |
| Create/edit any course | ✓ | ✓ | | |
| Edit assigned course | ✓ | ✓ | ✓ (assigned) | |
| View student progress | ✓ | ✓ | ✓ (assigned) | |
| Consume content | | | | ✓ (enrolled) |

The permission matrix is defined in code (a role → permissions map), not in the database.

## Member-management operations

The invite/change-role/remove/list surface absorbed from the former `team` context. Writes go through the `OrgAdmin` port (Better Auth); the core mirror updates via `organizationHooks`.

- **`list`** — paged/filtered query (search, sort, `role`, `status`).
- **`invite`** — invite by email + role; rejects an email already a member or invited.
- **`updateRole`** — change a member's role.
- **`remove`** — remove a member.

### Rules

- **The owner role cannot be reassigned** — `updateRole` on an owner raises `OrganizationRuleError`.
- A duplicate invite (email already a member or invited) raises `OrganizationRuleError`.

`OrganizationRuleError` surfaces at the HTTP boundary as `409 Conflict`.

## Boundaries

1. **organizations ↔ Better Auth**
   - The organization plugin is the source of truth; core holds a read-only mirror via `organizationHooks`. Member writes go through Better Auth via the `OrgAdmin` port.
   - Connection: read-only mirror via hooks; writes via the `OrgAdmin` port.
2. **organizations ↔ identity**
   - *identity* owns the user record.
   - *organizations* references the user id on membership / course assignment.
   - Connection: reference only.
3. **organizations ↔ courses**
   - Course assignments reference a course by id (instructor scope).
   - Connection: reference by id. organizations never reads course content.
4. **organizations → all contexts**
   - Provides `org_id` for tenant scoping.
   - Connection: reference + authorization lookup.

## Events

- `organization.created`
- `membership.created`, `role.assigned`
- `invitation.created`, `invitation.accepted`

## Multi-tenancy

Organization is the tenant root. Every org-scoped table carries a composite `(org_id, id)` key with `org_id` → `organization`. Users are global (one per Better Auth user); the org↔user link is membership.

## Build state

Built and **persisted** via a Drizzle repository (`adapters/db/repositories/organizations.ts`), including the absorbed member-management surface.
