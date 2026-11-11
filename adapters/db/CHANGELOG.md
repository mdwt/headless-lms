# @headless-lms/adapter-db

## 0.6.2

### Patch Changes

- Updated dependencies [[`ca0f1da`](https://github.com/mdwt/headless-lms/commit/ca0f1da6ce3f92f2cfd0ec02d63df006f8dd0ac8)]:
  - @headless-lms/core@0.8.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`09803d1`](https://github.com/mdwt/headless-lms/commit/09803d113718799a421c6b0c4f5040cf5e5efdd1)]:
  - @headless-lms/core@0.7.0

## 0.6.0

### Minor Changes

- [`0f1c31c`](https://github.com/mdwt/headless-lms/commit/0f1c31c68cfa57059446b3ef5b7665f54d8f4f98) Thanks [@mdwt](https://github.com/mdwt)! - An organization carries `metadata`, key-value strings. `POST /api/platform/organizations` takes optional `metadata` (at most 50 keys, keys up to 40 characters, values up to 500), stores it with the organization and returns it on `organization`. The API key created with the organization is always named `Platform`.

  Breaking changes:

  - `POST /api/platform/organizations` no longer takes `keyName`.
  - `Organization` carries `metadata`, and `OrganizationsRepository` adds `setMetadata`.

- [`6924b0d`](https://github.com/mdwt/headless-lms/commit/6924b0d941ba149e3c7a8ee250e9e487ef8edf1e) Thanks [@mdwt](https://github.com/mdwt)! - A space has an optional cover, background and icon, each a ready image from the media library: `coverAssetId`, `backgroundAssetId` and `iconAssetId` on the space update, `null` to clear one, and `coverUrl`, `backgroundUrl` and `iconUrl` on the space. The images of a space in a published community are public; otherwise they are served through access-checked file links.

### Patch Changes

- Updated dependencies [[`5906dfa`](https://github.com/mdwt/headless-lms/commit/5906dfa2c2ff2f05a913f0e73ec5911af37b06c7), [`0f1c31c`](https://github.com/mdwt/headless-lms/commit/0f1c31c68cfa57059446b3ef5b7665f54d8f4f98), [`6924b0d`](https://github.com/mdwt/headless-lms/commit/6924b0d941ba149e3c7a8ee250e9e487ef8edf1e)]:
  - @headless-lms/core@0.6.0

## 0.5.0

### Minor Changes

- [`28b6239`](https://github.com/mdwt/headless-lms/commit/28b6239a2995088e33f877598e4fa116e54a49d3) Thanks [@mdwt](https://github.com/mdwt)! - Configurable roles and permissions. The fixed roles owner, admin, instructor, moderator and student are replaced by a permission list in code and roles as data: a deployment ships a default set (Owner, Admin, Instructor, Moderator, Member), and an org renames its roles or, through the API, changes them and adds its own. A role is given on the whole org or on one content item (a course or a community); a person's permissions on an item are their org role's plus the role given on that item. Every check is a permission check in a core service method, and nobody can grant a permission they don't hold.

  Breaking changes:

  - Wire: `role` is gone from org users, members, the member viewer, comment authors, directory entries and community members. Views carry `orgRole: { key, name }` and `isOwner`; people in a community carry `team` and `roleName`; the member viewer adds `permissions` and `orgPermissions`; the member community home adds `viewer.permissions`, `opensEverySpace`, `team` and `roleName`. Invites take a `roleKey`. `dmSettings.memberToStaff` and `staffToAnyone` become `memberToTeam` and `teamToAnyone`. `GET /api/access/scopes` becomes `GET /api/access/permissions` and `GET /api/access/permissions/list`. The session no longer carries `activeMemberRole`.
  - New operations for roles and people: list, add, change, reset and delete roles; give and take a role on the org or an item; transfer ownership; cancel and resend invites.
  - Events: `organization.role.created`, `.updated`, `.deleted`, `.assigned`, `.unassigned` and `organization.ownership.transferred` are new. `organization.user.*`, `organization.invite.*` and `organization.student.*` move to version 2 without `role`. Automation filters keyed on `role` no longer match; the "Role assigned" trigger filters on `roleKey`, `contentType` and `contentId`.
  - Notifications: `moderator.assigned` and the `youAreNowAModerator` email become `role.assigned` and `roleAssigned`; the `staff` reason becomes `moderator`. Review notifications go to holders of `communities:moderate` or `courses:moderate` on the item.
  - API keys and connected apps: scopes are permissions from the same list. A key's or token's effective permissions are its scopes intersected with its creator's current permissions. MCP tools take the permission of the core method they call. Webhooks need the read permission of every event they subscribe to.
  - `adapter-auth`: every org user who accepts gets a Better Auth membership whose `role` is `owner` or `participant` and never changes with their roles. The `ApiKeys` port is keyed on org and user ids. Better Auth's organization and API key endpoints that would bypass core are refused over HTTP.
  - `adapter-db`: migration `0017` adds `org_roles` and `role_assignments` and drops `org_users.role`. No data is carried over; development databases are recreated.

- [`4f7fde0`](https://github.com/mdwt/headless-lms/commit/4f7fde0636b5829c477f194334b90f2299576905) Thanks [@mdwt](https://github.com/mdwt)! - Events: a content type with a time, a time zone, a location (a venue with its address, a meeting link, or both), a recording, attached files and settings (`public` or `private`, a capacity, notifications on or off, and replay). Staff create, edit, publish, cancel and delete events through `/api/events` and the MCP event tools; members list, open and register through `/api/member/events`, and get a calendar file per event. Going to an event is a grant: registering, staff adding someone, an API client and the automations Grant access action all call `entitlements.grant`, which holds every event rule, takes a capacity lock and counts the attendees under it. Attendees are notified when they are added or removed, when the event moves or changes place, when it is canceled, and a day and an hour before it starts. The admin overview counts upcoming events, and each event has attendee and analytics reads.

  `entitlements.revoke` takes a person and a content id. `entitlements.ensureGrant` is removed: automations grant through `grant`, so granting again makes a revoked or expired grant active with the new expiry. The service sets a grant's `source` from the caller (`self`, `automation` or `manual`); `GrantEntitlementInput` no longer takes one.

  Domain events carry `metadata.actorId`, renamed from `actorOrgUserId`, and so do the request context and notifications (`actorId`, column `actor_id`).

  `ContainerConfig.databasePool` sizes the API's Postgres pool: `max`, `idleTimeoutMillis` and `connectionTimeoutMillis` (`DATABASE_POOL_MAX`, `DATABASE_POOL_IDLE_TIMEOUT_MS` and `DATABASE_POOL_CONNECTION_TIMEOUT_MS` in the API). Unset values keep pg's defaults.

  Breaking: `actorOrgUserId` is `actorId` in domain event metadata and notifications; `EntitlementsService.ensureGrant` and `EntitlementsRepository.insertIfAbsent` and `setExpiresAt` are removed; the entitlements `SpaceReader` port is `ContentReader`.

- [`5364095`](https://github.com/mdwt/headless-lms/commit/536409507d9d4956027c323fca8fdc5d60f19276) Thanks [@mdwt](https://github.com/mdwt)! - Live chat: every chat change is delivered to the members' open streams on every API instance. A new `PubSub` port carries chat changes between instances; the chat hub on each instance pushes the current state to the streams connected to it over server-sent events. `GET /api/member/communities/:communityId/chats/events` (`streamMemberChatEvents`) streams `ChatLiveEvent`s; access is checked when the stream opens. New reads: one chat (`getMemberChat`), the direct chat with a person (`getMemberDirectChat`) and the unread total (`getMemberChatUnread`); `sendChatTyping` tells the chat you are typing. `listMemberChats` takes `requests`, `ChatListItem` carries the participants' profiles, and a send takes a `clientId` that makes a repeat send return the stored message.

  Marking a chat read, changing a reaction and muting a chat now emit domain events (`discussion.chat.read`, `discussion.message.reactions.changed`, `discussion.chat.muted`) with no public form; a read mark only moves forward. `adapter-db` adds `messages.client_id` with its unique index (migration `0018`).

  Breaking: `ServerConfig` requires `pubsubDatabaseUrl`. The container takes `adapters.pubsub` (a `PubSub` or a factory given the logger) and exposes `container.pubsub` and `container.chatHub`; without one the stream answers 503. The entry point starts both after `listen` and before the outbox relay, as the scaffolded `main.ts` now does.

### Patch Changes

- [`2e99dd4`](https://github.com/mdwt/headless-lms/commit/2e99dd427b59ee7aed21572ebfc12b8039323998) Thanks [@mdwt](https://github.com/mdwt)! - `createDb` takes a logger and listens for errors on its pool. Before this, Postgres terminating an idle pooled connection (a restart, a failover, `pg_terminate_backend`) emitted an `error` event nobody handled, and the API process crashed. It now logs `database connection lost` and the pool replaces the connection; the container passes its logger as `db`.

- [`521a1c1`](https://github.com/mdwt/headless-lms/commit/521a1c11f2785dca67cb5c5b55a905ce4d3efcde) Thanks [@mdwt](https://github.com/mdwt)! - `DrizzleOutboxStore.fetchBatch` claims the messages it returns for `OUTBOX_CLAIM_MS` (60 s), so with several API instances each event is dispatched by one relay instead of by every relay polling at the time. A relay that stops mid-batch leaves its messages to the others once the claim lapses.

- Updated dependencies [[`b1e591a`](https://github.com/mdwt/headless-lms/commit/b1e591aec98dd633713f55ee99f424853ea3bd41), [`28b6239`](https://github.com/mdwt/headless-lms/commit/28b6239a2995088e33f877598e4fa116e54a49d3), [`d902c10`](https://github.com/mdwt/headless-lms/commit/d902c1070ca1603a35ef0b525ba0c7899034abec), [`4f7fde0`](https://github.com/mdwt/headless-lms/commit/4f7fde0636b5829c477f194334b90f2299576905), [`5364095`](https://github.com/mdwt/headless-lms/commit/536409507d9d4956027c323fca8fdc5d60f19276), [`2a80581`](https://github.com/mdwt/headless-lms/commit/2a805817f266f5fd61b949f842622941b6262927), [`86a39a0`](https://github.com/mdwt/headless-lms/commit/86a39a04c887fddd787cb700bd40c2f9368907d6), [`96a06eb`](https://github.com/mdwt/headless-lms/commit/96a06eb1fd501da91f2324bedbb57ed3d3c4e866)]:
  - @headless-lms/core@0.5.0

## 0.4.0

### Minor Changes

- [`f9faa8f`](https://github.com/mdwt/headless-lms/commit/f9faa8fb287da9c3c8d8f50194155430d63e8516) Thanks [@mdwt](https://github.com/mdwt)! - Notification subsystem: notification types and recipient rules in code, community and org notification categories, member settings per category, channel and space, push devices, follows and mutes as subscriptions, mentions, reaction and edit events, debounced chat notifications, community digests on their own schedule, and a filtered notification list with unread counts. Timed product work (scheduled posts, grant expiry, digests, the upload sweep) runs as jobs on a new `Scheduler` port.

  Breaking: nothing is seeded for a new org or community, and the seeded automations, the `notify` action and the automation `source` are gone; `GET`/`PUT /api/member/notification-preferences`, the post follow routes and the chat mute routes are removed in favour of notification settings and subscriptions; a `workflows` adapter must implement `Scheduler` beside `AutomationEngine`. The scaffolded `main.ts` starts the outbox relay and the engine after `listen`.

### Patch Changes

- Updated dependencies [[`f9faa8f`](https://github.com/mdwt/headless-lms/commit/f9faa8fb287da9c3c8d8f50194155430d63e8516)]:
  - @headless-lms/core@0.4.0

## 0.3.0

### Minor Changes

- Communities with spaces, posts, chats, moderation and member profiles; an MCP server with OAuth sign-in, connected apps and scoped API keys; access-checked proxy URLs for every file; per-person notification preferences; one API error envelope and request limits; security hardening across automations, auth and webhooks. Breaking: an organization no longer edits a person's name or email.

### Patch Changes

- Updated dependencies []:
  - @headless-lms/core@0.3.0

## 0.2.0

### Minor Changes

- [`0ac4296`](https://github.com/mdwt/headless-lms/commit/0ac429661b55b308d60572445927036d398b522f) Thanks [@mdwt](https://github.com/mdwt)! - Bundles, webhook automations, course and student analytics, admin forgot-password, human-friendly automation trigger labels and self-signup externalId linking, plus API spec and content settings fixes.

### Patch Changes

- Updated dependencies [[`0ac4296`](https://github.com/mdwt/headless-lms/commit/0ac429661b55b308d60572445927036d398b522f)]:
  - @headless-lms/core@0.2.0

## 0.1.0

### Minor Changes

- 0f137b9: Initial public release

### Patch Changes

- Updated dependencies [0f137b9]
  - @headless-lms/core@0.1.0
