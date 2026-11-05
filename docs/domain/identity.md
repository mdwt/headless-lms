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

## Notification settings and devices

A notification setting is a person's own choice about one category of notification on one channel: in the app, by email or by push, on or off. A person sets it for a community, for one space in a community when the category allows it, or for the org. Where the person has made no choice, the category's default applies. Identity keeps only the choices the person made.

A device is one app install's push address: an iPhone app, an Android app or a browser. It records the provider, the token and keys the provider needs, and when the app last checked in. A person can have several devices, one per install, in each org they sign in to. A device the app has not checked in from for 30 days receives nothing until it checks in again, and a device the provider reports as gone is removed.

The notifications themselves, and their delivery by email and push, are automations' record of what it sent.

## Boundaries

- **identity ↔ organizations** - organizations owns the org user: which people belong to which organization, the roles they hold there and what those roles permit.
- **identity ↔ assets** - assets owns the photo file and the rule that only the uploader may attach it. Identity checks that rule before storing the reference.
- **identity ↔ automations** - automations determines who an event concerns from the owning contexts' data, and stores and delivers notifications using categories and settings; identity keeps settings and devices.
- **identity ↔ discussion** - discussion owns follows and mutes on posts, spaces and chats; automations reads them for notifications.

## Events

- `user.created` — a person is created.
- `user.updated` — a person's details change.
- `user.login` — a person signs in.
- `user.logout` — a person signs out.
