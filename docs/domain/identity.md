# Identity — Domain Spec

Identity owns the **person** and the authentication of the account.

## Model

The identity model is about the person and authentication - it defines what the auth adapter needs to provide
and is where the user profile lives. Identity owns the auth use cases like
authentication, session management, reset password flows.

A user identity on its own is not linked to an organization, a person can belong to many organizations in
different roles.

## Profile

The profile is what other members see of a person: a display name, a headline, a bio, a photo, and application-defined fields that are not files. It is global like the user: one profile per person, so it carries no org.

The photo is an asset, and an asset belongs to an org. The profile therefore names both the org and the asset. The photo must be a member image the person uploaded in that org. It is shown only inside that org, to its org users. In another org the person has no photo until they upload one there. Unsetting the photo does not delete the file; the person deletes their own upload through assets once nothing references it.

## Notifications

A notification tells a person that something happened that concerns them. It belongs to the person, like their profile, together with their preferences for how they are told: in the app or by email.

## Boundaries

- **identity ↔ organizations** - organizations owns the org user: which people belong to which organization, and in which role.
- **identity ↔ assets** - assets owns the photo file and the rule that only the uploader may attach it. Identity checks that rule before storing the reference.
- **identity ↔ automations** - automations decides when a person is told and who. Identity keeps the person's notifications and preferences.

## Events

- `user.created` — a person is created.
- `user.updated` — a person's details change.
- `user.login` — a person signs in.
- `user.logout` — a person signs out.
