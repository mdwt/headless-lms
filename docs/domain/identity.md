# Identity — Domain Spec

Identity is the umbrella domain for everyone in the system. Every person — whether they run a course business or take a course — has their identity here, and every other context refers back to it by id. It owns two identity models: the **User** (staff side) and the **Student** (learner side).

## The two models

Staff and learners are kept as separate models because they are genuinely different populations. Staff arrive by invitation, are few in number, and work in the management dashboard. Learners arrive by enrolling or purchasing, can number in the thousands or more, and live in the student UI. Their lifecycles, their scale, and the surfaces they log into are all different, so they are modelled separately even though both are identities owned by this one domain.

- **User** — the staff identity. A User carries a role: Owner, Admin, or Instructor. The role itself is assigned in the organizations context through the user's membership of an org, but it belongs to the User.
- **Student** — the learner identity. A Student is the end-learner who consumes content; what they can access and how far they have progressed lives in other contexts that reference the Student by id.

Both models are mirrors of a Better Auth user, linked by the provider's user id.

## Authentication and system of record

Authentication — credentials, sessions, OAuth — is handled by Better Auth. Better Auth is also the **system of record** for users: it owns the real user data, and the domain's User and Student records are mirrors of it.

The mirror is kept in sync from Better Auth: when a user is created there, the corresponding domain record is created. Because Better Auth is the source of truth, replacing it with another provider (e.g. Clerk) would be a **data migration, not a simple swap**.

## Boundaries

1. **identity ↔ Better Auth** — Better Auth authenticates and is the system of record for users. Identity mirrors the User and Student into the domain and reads authentication from Better Auth.
2. **identity ↔ organizations** — organizations owns orgs and memberships, and it is through a membership that a User is given their role. Organizations references the User by id; the role belongs to the User.

## Events

- `user.registered` — a staff User is created.
- `user.updated` — a staff User's details change.
- `user.login` — a staff User signs in.
- `student.registered` — a learner Student is created.
- `student.updated` — a learner Student's details change.
- `student.login` — a learner Student signs in.

## Build state

Built and **persisted**.
