# Organizations — Domain Spec

Owns org/tenancy, membership, team roles, and course assignments. The tenant root every other context scopes to. Source of truth is Better Auth's organization plugin, mirrored into core.

## Scope

- Owns the **org (tenant)**, **membership** (student↔org), **team roles**, and **course assignments** (instructor scope).
- Owns **authorization** (role → permission) for team members.
- Does **not** own the student record (identity), access (entitlements), content (courses), or completion (progress).

## System of record

Better Auth's **organization plugin** is the system of record for organizations, members, and invitations. Core mirrors them via database hooks (`afterCreateOrganization`, `afterAddMember`, `afterCreateInvitation`, …) into domain tables. Org-scoped tables across the system carry `org_id` and FK to the mirrored organization. A provider swap is a **data migration, not a port swap**.

## Model

- **Organization** — the tenant. Root every org-scoped table FKs to. Mirrors a Better Auth org.
- **Membership** — links a student to an org with a role. Mirrors a Better Auth member.
- **Invitation** — a pending invite to join an org. Mirrors a Better Auth invitation.
- **Course assignment** — links an instructor membership to a course, scoping instructor permissions to assigned courses.

## Roles

Four roles, defined in code as a string-literal union (stored as a `text` column; **no DB enum**): `owner | admin | instructor | student`. Two axes: **role** (what) × **scope** (over what).

- **Owner** — full control, billing, ownership transfer. Org-global. One per org.
- **Admin** — manage courses, students, settings. Everything except billing/ownership. Org-global.
- **Instructor** — create/manage assigned courses, grade assessments. **Course-scoped** via a course assignment.
- **Student** — consume content. Default role. Per-enrollment (access owned by entitlements; the role here is "is a learner").

### Permissions (table stakes)

| Action | Owner | Admin | Instructor | Student |
|---|---|---|---|---|
| Manage billing / ownership | ✓ | | | |
| Manage org settings | ✓ | ✓ | | |
| Manage users | ✓ | ✓ | | |
| Create/edit any course | ✓ | ✓ | | |
| Edit assigned course | ✓ | ✓ | ✓ (assigned) | |
| Grade assessments | ✓ | ✓ | ✓ (assigned) | |
| View student progress | ✓ | ✓ | ✓ (assigned) | |
| Consume content | | | | ✓ (enrolled) |

The permission matrix is defined in code (a role → permissions map), not in the database.

## Boundaries

1. **organizations ↔ Better Auth**
   - The organization plugin is the system of record; core mirrors org/member/invitation via hooks.
   - Connection: mirror via hooks.
2. **organizations ↔ identity**
   - *identity* owns the student record.
   - *organizations* references the student id on membership / course assignment.
   - Connection: reference only.
3. **organizations ↔ courses**
   - Course assignments reference a course by id (instructor scope).
   - Connection: reference by id. organizations never reads course content.
4. **organizations → all contexts**
   - Provides `org_id` for tenant scoping, and grader authorization (instructor role + assignment) for assessment.
   - Connection: reference + authorization lookup.

## Events

- `organization.created`
- `membership.created`, `role.assigned`
- `invitation.created`, `invitation.accepted`

## Multi-tenancy

Organization is the tenant root. Every org-scoped table carries a composite `(org_id, id)` key with `org_id` → `organization`. Students are global (one per Better Auth user); the org↔student link is membership.
