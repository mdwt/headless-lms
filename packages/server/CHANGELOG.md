# @headless-lms/server

## 0.10.0

### Minor Changes

- [#38](https://github.com/mdwt/headless-lms/pull/38) [`0a1d250`](https://github.com/mdwt/headless-lms/commit/0a1d250f710ac697f07d93b346350363f89316ed) Thanks [@mdwt](https://github.com/mdwt)! - People can sign in from a page on any organization's host. An origin that is one of an organization's `hosts` is trusted beside the origins in `CLIENT_ORIGIN`, and a change of hosts applies from the next request, without a restart. A password reset link or magic link that returns to an organization's host is sent only to a person who is active in that organization.

  The session cookie is host-only when `AUTH_COOKIE_DOMAIN` is unset: it carries no `Domain` and belongs to whichever host served the request, so the API can be served on each organization's own domain under `/api`. Set `AUTH_COOKIE_DOMAIN` to a parent domain (`.example.com`) to share the cookie across its subdomains.

  Breaking: with `AUTH_COOKIE_DOMAIN` unset the cookie no longer carries the API's host as its `Domain`, so it is no longer sent to subdomains of the API's host. `OrgHostSettings` takes an `index` (`OrgHostIndex`; `DrizzleOrgHostIndex` in the database adapter), and a migration adds two indexes on `settings`. `OrganizationService` gains `isOrgHost` and `isHostOfPerson`, and `CreateAuthOptions` takes an optional `orgHosts`.

### Patch Changes

- Updated dependencies [[`0a1d250`](https://github.com/mdwt/headless-lms/commit/0a1d250f710ac697f07d93b346350363f89316ed)]:
  - @headless-lms/core@0.11.0
  - @headless-lms/adapter-auth@0.5.0
  - @headless-lms/adapter-db@0.7.0
  - @headless-lms/adapter-defaults@0.5.6

## 0.9.0

### Minor Changes

- [#35](https://github.com/mdwt/headless-lms/pull/35) [`8a4f692`](https://github.com/mdwt/headless-lms/commit/8a4f69250aa9535954e5b724985169826b7b137e) Thanks [@mdwt](https://github.com/mdwt)! - An organization holds where its member apps are reached: a `courses` host and a `community` host, both always set. A new organization starts with one host for both, its slug as a subdomain of the new `PLATFORM_HOST` variable (`https://example.com` gives `https://acme.example.com`), The organization carries its `hosts` wherever it is returned, and `PATCH /api/organizations` takes `hosts` to replace them. Links in emails, member invites and event calendar files use the organization's hosts at the moment the link is written: communities, spaces, posts, chats and events link to `community`, courses, lessons and downloads to `courses`.

  `createInvite` and `resendInvite` take an optional `host`, the app the invite link opens; it must be one of the organization's hosts.

  Breaking: `STUDENT_PORTAL_URL` and `Config.studentPortalUrl` are removed; set `PLATFORM_HOST` (`Config.platformHost`) instead. The slug sent to `POST /api/organizations` must be lowercase letters, numbers and hyphens, at most 50 characters. `TemplateContext.studentPortalUrl` is replaced by `TemplateContext.hosts` (`{ courses, community }`, `null` for an email sent outside an organization), `Mailer.send` takes the organization id as its fourth argument in place of a context override, and `MemberReportServiceParams.studentPortalUrl` is replaced by `hosts`.

### Patch Changes

- Updated dependencies [[`b57078e`](https://github.com/mdwt/headless-lms/commit/b57078e0299aeee8f796f9170f6b9155720debb5), [`8a4f692`](https://github.com/mdwt/headless-lms/commit/8a4f69250aa9535954e5b724985169826b7b137e)]:
  - @headless-lms/core@0.10.0
  - @headless-lms/adapter-auth@0.4.5
  - @headless-lms/adapter-db@0.6.4
  - @headless-lms/adapter-defaults@0.5.5

## 0.8.0

### Minor Changes

- [#30](https://github.com/mdwt/headless-lms/pull/30) [`932f883`](https://github.com/mdwt/headless-lms/commit/932f883c8a287e349083d2849a5ccc20a007e141) Thanks [@mdwt](https://github.com/mdwt)! - A file link is signed when the read is made and expires `deliveryExpirySeconds` after, with no signing window. `ServerConfig.deliveryWindowSeconds` is `deliveryExpirySeconds` again, `AssetsServiceImpl` takes `downloadLinkExpirySeconds` instead of `linkWindowSeconds`, and `ObjectStorage.presignDownload` takes `expiresInSeconds` instead of `signedAt` and `expiresAt`.

### Patch Changes

- [#14](https://github.com/mdwt/headless-lms/pull/14) [`ce18ba3`](https://github.com/mdwt/headless-lms/commit/ce18ba386d73e06588253bc8e39c119898b403f2) Thanks [@mdwt](https://github.com/mdwt)! - Sign-in rate limits count each member separately behind a chain of proxies. The container config takes `trustedProxies` (the IPs or CIDR ranges of the proxies in front of the API) and `ipAddressHeaders` (the headers read for the client IP), and passes them to better-auth. A generated installation reads them from `AUTH_TRUSTED_PROXIES` and `AUTH_IP_ADDRESS_HEADERS`, comma-separated. Without them, every request that arrives with more than one address in `X-Forwarded-For` shares one rate limit.

- [#29](https://github.com/mdwt/headless-lms/pull/29) [`e6ea327`](https://github.com/mdwt/headless-lms/commit/e6ea327d00ed2d84411bbc882dbf51f3fed33f68) Thanks [@mdwt](https://github.com/mdwt)! - The entitlements list filters by every content type: `type=community` is accepted on `GET /api/entitlements` and the `list_access` MCP tool, next to `course`, `download` and `event`.

- [#27](https://github.com/mdwt/headless-lms/pull/27) [`41766f7`](https://github.com/mdwt/headless-lms/commit/41766f7e66c9614857855e832d05082d7b1bdea7) Thanks [@mdwt](https://github.com/mdwt)! - Creating an invite returns the invited person's `orgUserId`, so access and item roles can be given to them without looking the person up. `POST /api/organizations/invites` and the `invite_person` and `invite_student` MCP tools return it.

- [#31](https://github.com/mdwt/headless-lms/pull/31) [`c9a3c48`](https://github.com/mdwt/headless-lms/commit/c9a3c48a547aad25b57d5602da63fb2c35ba3d6a) Thanks [@mdwt](https://github.com/mdwt)! - The platform key finds an organization by its slug: `GET /api/platform/organizations?slug=`.

- [#25](https://github.com/mdwt/headless-lms/pull/25) [`eb3ab88`](https://github.com/mdwt/headless-lms/commit/eb3ab88e7e294d035640c5a7cd55edd3bbfeb24d) Thanks [@mdwt](https://github.com/mdwt)! - Granting an entitlement to someone who already holds it no longer emits `entitlement.created`, so the access granted email and push are not sent again. When the expiry is the same, nothing is written and no event is emitted. When the expiry is different, the grant gets the new expiry and `entitlement.updated` is emitted. Granting a revoked or expired grant again still emits `entitlement.created`.

- Updated dependencies [[`ce18ba3`](https://github.com/mdwt/headless-lms/commit/ce18ba386d73e06588253bc8e39c119898b403f2), [`e6ea327`](https://github.com/mdwt/headless-lms/commit/e6ea327d00ed2d84411bbc882dbf51f3fed33f68), [`41766f7`](https://github.com/mdwt/headless-lms/commit/41766f7e66c9614857855e832d05082d7b1bdea7), [`932f883`](https://github.com/mdwt/headless-lms/commit/932f883c8a287e349083d2849a5ccc20a007e141), [`c9a3c48`](https://github.com/mdwt/headless-lms/commit/c9a3c48a547aad25b57d5602da63fb2c35ba3d6a), [`eb3ab88`](https://github.com/mdwt/headless-lms/commit/eb3ab88e7e294d035640c5a7cd55edd3bbfeb24d), [`9f13ac2`](https://github.com/mdwt/headless-lms/commit/9f13ac23d37a814749be2599dd703f4b3260003e)]:
  - @headless-lms/adapter-auth@0.4.4
  - @headless-lms/core@0.9.0
  - @headless-lms/adapter-db@0.6.3
  - @headless-lms/adapter-defaults@0.5.4

## 0.7.0

### Minor Changes

- [#23](https://github.com/mdwt/headless-lms/pull/23) [`ca0f1da`](https://github.com/mdwt/headless-lms/commit/ca0f1da6ce3f92f2cfd0ec02d63df006f8dd0ac8) Thanks [@mdwt](https://github.com/mdwt)! - Files are served straight from storage. The read that returns a lesson, download, event, post, message, upload or library file now carries a signed storage link for each of its files, made after that read has checked access, instead of an API URL that redirected to one. A file costs no API request, and its link works from any host.

  Links are signed for a window: every read in the same window returns the same link, so browsers and caches keep the file, and the link expires at the end of the next window. `ServerConfig.deliveryExpirySeconds` is now `deliveryWindowSeconds` (`DELIVERY_URL_EXPIRY`, default six hours). Every signed file is served with `Cache-Control: public, max-age=31536000, immutable`.

  The redirect routes are gone: `getCourseThumbnail`, `getDownloadThumbnail`, `getCommunityThumbnail`, `getEventThumbnail`, `getSpaceImage`, `getActivityFile`, `getDownloadFile`, `getEventFile`, `getPostCover`, `getPostAsset`, `getMessageAttachment`, `getMemberUploadFile`, `getLibraryFile` and `downloadLibraryFile`. In core, `AssetFiles.signFile` is replaced by `fileLinks`, `FileUrls` builds public image URLs only and `createFileUrls` takes just the public URL builder, `AssetsServiceImpl` takes `linkWindowSeconds` instead of `downloadLinkExpirySeconds` and `fileUrls`, and the member report, post and chat services no longer have methods that sign a single file. A member of an unpublished community sees its images only with `communities:read`, as before.

  `ObjectStorage.presignDownload` takes `signedAt` and `expiresAt` instead of `expiresInSeconds`, and the S3 and MinIO adapters no longer take `downloadExpirySeconds`. The S3 adapter takes an optional `cloudFront` (`url`, `keyPairId`, `privateKey`) to sign links for a CloudFront distribution in front of the bucket; `publicBaseUrl` defaults to its url.

### Patch Changes

- Updated dependencies [[`ca0f1da`](https://github.com/mdwt/headless-lms/commit/ca0f1da6ce3f92f2cfd0ec02d63df006f8dd0ac8)]:
  - @headless-lms/core@0.8.0
  - @headless-lms/adapter-auth@0.4.3
  - @headless-lms/adapter-db@0.6.2
  - @headless-lms/adapter-defaults@0.5.3

## 0.6.2

### Patch Changes

- [#12](https://github.com/mdwt/headless-lms/pull/12) [`09803d1`](https://github.com/mdwt/headless-lms/commit/09803d113718799a421c6b0c4f5040cf5e5efdd1) Thanks [@mdwt](https://github.com/mdwt)! - The notification process runs apart from org automations. It has its own event bus subscriber, so a notification failure no longer fails the automations handler, and notifications no longer wait for automations to be dispatched. Notification deliveries have their own executor: `AutomationExecutor` no longer has `runDelivery`; an `AutomationEngine` takes a `DeliveryExecutor` through `registerDeliveries`, and `NotificationDelivery` implements it (`run` is now `runDelivery`). `AutomationsServiceImpl` no longer takes `delivery` or `processor`. `InMemoryEventBus` runs every handler even when one throws, then rejects with that error, or an `AggregateError` when several fail, so the outbox redelivers the event.

- Updated dependencies [[`09803d1`](https://github.com/mdwt/headless-lms/commit/09803d113718799a421c6b0c4f5040cf5e5efdd1)]:
  - @headless-lms/core@0.7.0
  - @headless-lms/adapter-defaults@0.5.2
  - @headless-lms/adapter-auth@0.4.2
  - @headless-lms/adapter-db@0.6.1

## 0.6.1

### Patch Changes

- [#10](https://github.com/mdwt/headless-lms/pull/10) [`55b841b`](https://github.com/mdwt/headless-lms/commit/55b841bd93e97806773b333595c953f516a284a6) Thanks [@mdwt](https://github.com/mdwt)! - An installation can supply its own event bus: `adapters.eventBus` takes an `EventBus`, or a factory given its logger, in place of the same-process `InMemoryEventBus`. The outbox relay publishes to it, the core subscribers are attached to it, and the container exposes it as `container.eventBus`. `EventBus`, `DomainEvent` and `EventDefinition` are exported from `@headless-lms/server`.

## 0.6.0

### Minor Changes

- [#8](https://github.com/mdwt/headless-lms/pull/8) [`5906dfa`](https://github.com/mdwt/headless-lms/commit/5906dfa2c2ff2f05a913f0e73ec5911af37b06c7) Thanks [@mdwt](https://github.com/mdwt)! - Only a signed-in person can create an API key. `POST /api/access/api-keys` answers 403 when the request is made with an API key or an app token. `EffectivePermissions` has `isToken()`, true for a caller that is a key or an app token.

- [`0f1c31c`](https://github.com/mdwt/headless-lms/commit/0f1c31c68cfa57059446b3ef5b7665f54d8f4f98) Thanks [@mdwt](https://github.com/mdwt)! - An organization carries `metadata`, key-value strings. `POST /api/platform/organizations` takes optional `metadata` (at most 50 keys, keys up to 40 characters, values up to 500), stores it with the organization and returns it on `organization`. The API key created with the organization is always named `Platform`.

  Breaking changes:

  - `POST /api/platform/organizations` no longer takes `keyName`.
  - `Organization` carries `metadata`, and `OrganizationsRepository` adds `setMetadata`.

- [`6924b0d`](https://github.com/mdwt/headless-lms/commit/6924b0d941ba149e3c7a8ee250e9e487ef8edf1e) Thanks [@mdwt](https://github.com/mdwt)! - A space has an optional cover, background and icon, each a ready image from the media library: `coverAssetId`, `backgroundAssetId` and `iconAssetId` on the space update, `null` to clear one, and `coverUrl`, `backgroundUrl` and `iconUrl` on the space. The images of a space in a published community are public; otherwise they are served through access-checked file links.

### Patch Changes

- Updated dependencies [[`5906dfa`](https://github.com/mdwt/headless-lms/commit/5906dfa2c2ff2f05a913f0e73ec5911af37b06c7), [`0f1c31c`](https://github.com/mdwt/headless-lms/commit/0f1c31c68cfa57059446b3ef5b7665f54d8f4f98), [`6924b0d`](https://github.com/mdwt/headless-lms/commit/6924b0d941ba149e3c7a8ee250e9e487ef8edf1e)]:
  - @headless-lms/core@0.6.0
  - @headless-lms/adapter-db@0.6.0
  - @headless-lms/adapter-auth@0.4.1
  - @headless-lms/adapter-defaults@0.5.1

## 0.5.0

### Minor Changes

- [`b1e591a`](https://github.com/mdwt/headless-lms/commit/b1e591aec98dd633713f55ee99f424853ea3bd41) Thanks [@mdwt](https://github.com/mdwt)! - API keys work on every route under `/api`, not only `/mcp`, sent in the `x-api-key` header or as `Authorization: Bearer <key>`. A request that carries a key is judged on the key alone and never falls back to a session cookie. A key carries one of the organization's roles and holds that role's current permissions, limited to its creator's; it can expire after 1 to 365 days, and every new key starts with `hlms_`. `GET /api/access/api-keys/roles` lists the roles a person can put on a key, and a role can't be deleted while a key carries it.

  A platform key, set with `PLATFORM_KEY` and `PLATFORM_ACCOUNT_EMAIL`, creates organizations and their API keys through `POST /api/platform/organizations` and `POST /api/platform/organizations/:orgId/api-keys`. The organizations are owned by a platform account that can't sign in.

  Breaking changes:

  - `POST /api/access/api-keys` takes `role` and an optional `expiresInDays` instead of `scopes`. A key's response carries `role` and `expiresAt` instead of `scopes`. Keys created with scopes no longer verify.
  - `OrganizationService.resolveCaller` and `actorFor` take a `CallerLimit` (`{ scopes }` or `{ roleKey }`) instead of a scope list, and `AccessGrant` carries `limit` instead of `scopes`.
  - The `ApiKeys` port returns stored keys with `roleKey` and `expiresAt`, takes `{ name, roleKey, expiresInDays }` on create, and adds `countWithRole`. `OrgAdmin` adds `createOrganizationFor`, and the new `Accounts` port creates the platform account.

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

- [`779799d`](https://github.com/mdwt/headless-lms/commit/779799d9c21d703707b26003377bf4aa2075f7ff) Thanks [@mdwt](https://github.com/mdwt)! - `closeOnSignals(app)` closes the server on SIGTERM or SIGINT so its close hooks run: open chat streams get `closed { reason: 'shutdown' }`, the outbox relay drains, the automation engine stops and PubSub unlistens. A second signal, or a close that takes longer than 10 s, exits at once. The API entry point and the project template call it after `listen`. Before this, nothing closed the server on a signal, and the Hatchet worker's own signal handler exited the process as soon as the worker stopped. `adapter-workflow-hatchet` now starts its worker with `handleKill: false` and logs `hatchet worker stopped`.

- [`5364095`](https://github.com/mdwt/headless-lms/commit/536409507d9d4956027c323fca8fdc5d60f19276) Thanks [@mdwt](https://github.com/mdwt)! - Live chat: every chat change is delivered to the members' open streams on every API instance. A new `PubSub` port carries chat changes between instances; the chat hub on each instance pushes the current state to the streams connected to it over server-sent events. `GET /api/member/communities/:communityId/chats/events` (`streamMemberChatEvents`) streams `ChatLiveEvent`s; access is checked when the stream opens. New reads: one chat (`getMemberChat`), the direct chat with a person (`getMemberDirectChat`) and the unread total (`getMemberChatUnread`); `sendChatTyping` tells the chat you are typing. `listMemberChats` takes `requests`, `ChatListItem` carries the participants' profiles, and a send takes a `clientId` that makes a repeat send return the stored message.

  Marking a chat read, changing a reaction and muting a chat now emit domain events (`discussion.chat.read`, `discussion.message.reactions.changed`, `discussion.chat.muted`) with no public form; a read mark only moves forward. `adapter-db` adds `messages.client_id` with its unique index (migration `0018`).

  Breaking: `ServerConfig` requires `pubsubDatabaseUrl`. The container takes `adapters.pubsub` (a `PubSub` or a factory given the logger) and exposes `container.pubsub` and `container.chatHub`; without one the stream answers 503. The entry point starts both after `listen` and before the outbox relay, as the scaffolded `main.ts` now does.

- [`86a39a0`](https://github.com/mdwt/headless-lms/commit/86a39a04c887fddd787cb700bd40c2f9368907d6) Thanks [@mdwt](https://github.com/mdwt)! - `entitlements.setStatus`, `PATCH /api/entitlements/{id}` (`setEntitlementStatus`) and the `set_access_status` MCP tool are removed. `entitlements.revoke` takes a person and exactly one of a content id or a bundle id, and is served at `POST /api/entitlements/revoke` (`revokeEntitlement`) and by the `revoke_access` MCP tool. Granting again makes a revoked grant active, through `grant` and its event rules.

- [`96a06eb`](https://github.com/mdwt/headless-lms/commit/96a06eb1fd501da91f2324bedbb57ed3d3c4e866) Thanks [@mdwt](https://github.com/mdwt)! - Rich post bodies: the server reads a post's body through a `BodyParser` port, which returns its plain text, its mentions and the files it shows. The default `PlainBodyParser` (`@headless-lms/adapter-defaults/body`) reads the body as plain text; the container takes another through `adapters.bodyParser`. Notification and email excerpts use the parsed text.

  A body can show any file its author uploaded: a member upload takes any content type, and its kind (image, video, audio or document) follows the type. `PostView.assets` describes each file the body shows (its URL, kind, filename and size), and `GET /api/member/posts/:postId/assets/:assetId` (`getPostAsset`) serves it to whoever can read the post; a file a browser cannot show inline downloads under its filename. A body holds at most 20 files. A post no longer needs a topic in a space that defines topics. A refused upload names the size limit.

  Breaking: `ServerConfig` requires `memberFileMaxBytes`, the largest member upload that is not an image (`MEMBER_FILE_MAX_BYTES` in the scaffolded config, 100 MB by default).

- [`d4328b6`](https://github.com/mdwt/headless-lms/commit/d4328b6cb06836689c3522a62822d7bfff818f71) Thanks [@mdwt](https://github.com/mdwt)! - Action routes end in a verb. `/approval`, `/removal`, `/restoration`, `/flags/resolution`, `/acceptance`, `/refusal` and `/submission` are now `/approve`, `/remove`, `/restore`, `/flags/resolve`, `/accept`, `/refuse` and `/submit`. `POST /api/organizations/ownership` is `POST /api/organizations/transfer-ownership`. Registering for an event is `POST /api/member/events/{eventId}/register` and cancelling it is `POST /api/member/events/{eventId}/unregister`, replacing `POST` and `DELETE` on `/registration`. Operation ids and SDK function names are unchanged.

### Patch Changes

- [`2e99dd4`](https://github.com/mdwt/headless-lms/commit/2e99dd427b59ee7aed21572ebfc12b8039323998) Thanks [@mdwt](https://github.com/mdwt)! - `createDb` takes a logger and listens for errors on its pool. Before this, Postgres terminating an idle pooled connection (a restart, a failover, `pg_terminate_backend`) emitted an `error` event nobody handled, and the API process crashed. It now logs `database connection lost` and the pool replaces the connection; the container passes its logger as `db`.

- [`4149b56`](https://github.com/mdwt/headless-lms/commit/4149b561736d262dfeaff3b60d2d4e2815b75646) Thanks [@mdwt](https://github.com/mdwt)! - The chat event stream logs `event stream ended` at info when it ends, with how long it was open, how many events it carried and why it ended (`client`, `server`, `undrained` or `error`). Fastify's own `request completed` line is missing when the client is the one to disconnect.

- Updated dependencies [[`b1e591a`](https://github.com/mdwt/headless-lms/commit/b1e591aec98dd633713f55ee99f424853ea3bd41), [`28b6239`](https://github.com/mdwt/headless-lms/commit/28b6239a2995088e33f877598e4fa116e54a49d3), [`2e99dd4`](https://github.com/mdwt/headless-lms/commit/2e99dd427b59ee7aed21572ebfc12b8039323998), [`d902c10`](https://github.com/mdwt/headless-lms/commit/d902c1070ca1603a35ef0b525ba0c7899034abec), [`4f7fde0`](https://github.com/mdwt/headless-lms/commit/4f7fde0636b5829c477f194334b90f2299576905), [`5364095`](https://github.com/mdwt/headless-lms/commit/536409507d9d4956027c323fca8fdc5d60f19276), [`2a80581`](https://github.com/mdwt/headless-lms/commit/2a805817f266f5fd61b949f842622941b6262927), [`521a1c1`](https://github.com/mdwt/headless-lms/commit/521a1c11f2785dca67cb5c5b55a905ce4d3efcde), [`86a39a0`](https://github.com/mdwt/headless-lms/commit/86a39a04c887fddd787cb700bd40c2f9368907d6), [`96a06eb`](https://github.com/mdwt/headless-lms/commit/96a06eb1fd501da91f2324bedbb57ed3d3c4e866)]:
  - @headless-lms/core@0.5.0
  - @headless-lms/adapter-auth@0.4.0
  - @headless-lms/adapter-db@0.5.0
  - @headless-lms/adapter-defaults@0.5.0

## 0.4.0

### Minor Changes

- [`f9faa8f`](https://github.com/mdwt/headless-lms/commit/f9faa8fb287da9c3c8d8f50194155430d63e8516) Thanks [@mdwt](https://github.com/mdwt)! - Notification subsystem: notification types and recipient rules in code, community and org notification categories, member settings per category, channel and space, push devices, follows and mutes as subscriptions, mentions, reaction and edit events, debounced chat notifications, community digests on their own schedule, and a filtered notification list with unread counts. Timed product work (scheduled posts, grant expiry, digests, the upload sweep) runs as jobs on a new `Scheduler` port.

  Breaking: nothing is seeded for a new org or community, and the seeded automations, the `notify` action and the automation `source` are gone; `GET`/`PUT /api/member/notification-preferences`, the post follow routes and the chat mute routes are removed in favour of notification settings and subscriptions; a `workflows` adapter must implement `Scheduler` beside `AutomationEngine`. The scaffolded `main.ts` starts the outbox relay and the engine after `listen`.

### Patch Changes

- Updated dependencies [[`f9faa8f`](https://github.com/mdwt/headless-lms/commit/f9faa8fb287da9c3c8d8f50194155430d63e8516)]:
  - @headless-lms/core@0.4.0
  - @headless-lms/adapter-db@0.4.0
  - @headless-lms/adapter-defaults@0.4.0
  - @headless-lms/adapter-auth@0.3.1

## 0.3.0

### Minor Changes

- Communities with spaces, posts, chats, moderation and member profiles; an MCP server with OAuth sign-in, connected apps and scoped API keys; access-checked proxy URLs for every file; per-person notification preferences; one API error envelope and request limits; security hardening across automations, auth and webhooks. Breaking: an organization no longer edits a person's name or email.

### Patch Changes

- Updated dependencies []:
  - @headless-lms/core@0.3.0
  - @headless-lms/adapter-auth@0.3.0
  - @headless-lms/adapter-db@0.3.0
  - @headless-lms/adapter-defaults@0.3.0

## 0.2.0

### Minor Changes

- [`0ac4296`](https://github.com/mdwt/headless-lms/commit/0ac429661b55b308d60572445927036d398b522f) Thanks [@mdwt](https://github.com/mdwt)! - Bundles, webhook automations, course and student analytics, admin forgot-password, human-friendly automation trigger labels and self-signup externalId linking, plus API spec and content settings fixes.

### Patch Changes

- Updated dependencies [[`0ac4296`](https://github.com/mdwt/headless-lms/commit/0ac429661b55b308d60572445927036d398b522f)]:
  - @headless-lms/core@0.2.0
  - @headless-lms/adapter-auth@0.2.0
  - @headless-lms/adapter-db@0.2.0
  - @headless-lms/adapter-defaults@0.2.0

## 0.1.0

### Minor Changes

- 0f137b9: Initial public release

### Patch Changes

- Updated dependencies [0f137b9]
  - @headless-lms/core@0.1.0
  - @headless-lms/adapter-auth@0.1.0
  - @headless-lms/adapter-db@0.1.0
  - @headless-lms/adapter-defaults@0.1.0
