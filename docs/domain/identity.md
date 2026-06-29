# Identity — Domain Spec

Owns the domain user/student and authentication. Better Auth is the system of record for users; identity mirrors it into the domain. Org, membership, and roles belong to **organizations**, not here.

## Scope

- Owns the **domain user/student** record other contexts reference (the canonical student id).
- Mirrors users from **Better Auth** (the system of record for credentials, sessions, and the user table) into the domain via database hooks.
- Does **not** own org/tenancy, membership, or team roles — those belong to **organizations**.
- Does not own access (entitlements) or completion (progress).

## Model

- **Student** — the domain identity for a learner or team member. Canonical id referenced across the system. Mirrors a Better Auth user, linked by the provider user id.

## Authentication and system of record

Better Auth authenticates (credentials, sessions, OAuth) **and is the system of record** for the user table. The domain `Student` is a mirror, kept in sync by database hooks on user creation. Other contexts reference the domain student id. Swapping the provider is a **data migration, not a port swap** — Better Auth is the system of record, not an interchangeable adapter behind a generic port.

## Boundaries

1. **identity ↔ Better Auth**
   - *Better Auth* authenticates and is the user system of record.
   - *identity* mirrors the user into a domain `Student` via database hooks.
   - Connection: mirror via hooks; the provider is the system of record.
2. **identity → all contexts**
   - Other contexts reference the domain student id.
   - Connection: reference only.
3. **identity ↔ organizations**
   - *organizations* owns org/membership/roles and references the student id.
   - *identity* owns the student record.
   - Connection: reference only.

## Events

- `student.registered`
