# Team — Domain Spec

Owns org member & role management operations — the invite/change-role/remove surface that the **organizations** spec describes as member management. Organizations owns the role/permission matrix; team owns the operations and their rules.

## Scope

- Owns the **member-management operations**: invite a member, change a member's role, remove a member, list members.
- Owns the **team rules** enforced on those operations.
- Does **not** own the role→permission matrix (organizations) or the student record (identity).

## Model

- **Member** — id, name, email, image, `role`, `status`, `joinedAt`, `invitedAt`.
- **Role** — `owner | admin | instructor | student` (the organizations role set).
- **Status** — `active | invited`.

## Key operations

- **`list`** — paged/filtered query (search, sort, `role`, `status`).
- **`invite`** — invite by email + role; rejects an email already a member or invited.
- **`updateRole`** — change a member's role.
- **`remove`** — remove a member.

## Rules

- **The owner role cannot be reassigned** — `updateRole` on an owner raises `TeamRuleError`.
- A duplicate invite (email already present) raises `TeamRuleError`.

`TeamRuleError` surfaces at the HTTP boundary as `409 Conflict`.

## Boundaries

1. **team ↔ organizations** — organizations owns the role/permission matrix and persisted membership mirror; team owns the operations performed against members and the rules on them.
2. **team ↔ identity** — references the member's identity (name/email) for display.

## Build state

In-memory repository (no persistence, no events emitted). Rules live in `TeamServiceImpl`; lookups (`findByEmail` / `findById`) and writes delegate to the repo.
