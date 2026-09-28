# Identity — Domain Spec

Identity owns the **person** and the authentication of the account.

## Model

The identity model is about the person and authentication - it defines what the auth adapter needs to provide
and is where the user profile lives. Identity owns the auth use cases like
authentication, session management, reset password flows.

A user identity on its own is not linked to an organization, a person can belong to many organizations in
different roles.

## Boundaries

- **identity ↔ organizations** - organizations owns the org user: which people belong to which organization, and in which role.

## Events

- `user.created` — a person is created.
- `user.updated` — a person's details change.
- `user.login` — a person signs in.
- `user.logout` — a person signs out.
