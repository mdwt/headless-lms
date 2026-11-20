# @headless-lms/adapter-email-templates

## 0.4.0

### Minor Changes

- [#45](https://github.com/mdwt/headless-lms/pull/45) [`ad97bb3`](https://github.com/mdwt/headless-lms/commit/ad97bb337be2f7c09c49f0888ca44fdaaeb62834) Thanks [@mdwt](https://github.com/mdwt)! - An organization's two hosts become apps. An app is a frontend the organization runs on a domain, with a name and a slug, serving courses, the community, or both. A domain belongs to one app across the installation, and an organization has at most one app that serves courses and one that serves the community. A new organization starts with no app; it creates one in the admin's Settings → Apps or with `POST /api/apps`.

  - `GET`, `POST /api/apps` and `PATCH`, `DELETE /api/apps/:appId` manage them, with the MCP tools `list_apps`, `create_app`, `update_app` and `delete_app`. Listing needs `organizations:read`, the rest `organizations:write`. The SDK has them as `Apps`.
  - Organizations owns apps: `OrgApps` in `@headless-lms/core/organizations` lists, creates, changes and deletes them, gives an organization's apps and the app and organization of a domain, and the container has it as `apps`. `OrganizationsRepository` gains `createApp`, `listApps`, `findAppByDomain`, `updateApp` and `deleteApp`.
  - `GET /api/app` tells a frontend which organization and app the domain of the request is, with no session and no key. It answers for the `Origin` header, or else the `Referer`, and is limited to 100 requests in 10 seconds per client IP address.
  - A session started on an app's domain is for that app's organization. A person with an open invite there gets a session with no organization, and anyone else is refused: a sign-in answers `401`. On an origin in `CLIENT_ORIGIN`, or with no origin, a person in exactly one organization gets a session for it, as before.
  - A request with a session from an app's domain is logged with the app's id, and is a `401` when the session is for another organization.
  - The session reads under `/api/auth` (`GET get-session`, `list-sessions` and `organization/*`) answer `401` too when the session is for another organization than the app's, and `POST organization/set-active` is a `403` there for any organization but the app's. `GET /api/organizations/invites/:token` is a `404` there for an invite to another organization, and `describeInvite` takes the app the request came from.
  - A sign-in link's session is decided by the address the link returns to; the page it was opened from counts only when it names none.
  - The sign-in link email is sent after the request is answered, like the password reset email.
  - Accepting an invite and resetting a password mark the person's email as verified, so a sign-in link opened later leaves their password in place. `SessionAdmin` gains `confirmEmail`, and identity's `sendPasswordChanged` becomes `passwordReset`, which takes the account's id.
  - The bundled sign-in and invite emails name the organization, and the brand only for an email sent outside one.
  - The student sign-in page tells a person with an invitation they have not accepted to open the link in their invitation email, instead of signing them in and out again.
  - With `AUTH_COOKIE_DOMAIN` set, a sign-in from a domain outside it gets a host-only cookie, so an organization's own domain works beside the shared one.
  - The admin app's address, the API's and every origin in `CLIENT_ORIGIN` are refused as an app's domain, under either scheme. A domain is a bare `http` or `https` origin: a path, a query, a username or password, a wildcard or a trailing dot is refused.
  - A refused app answers `409` with the reason as `error`: `domain_taken`, `domain_reserved`, `slug_taken`, `courses_taken` or `community_taken`.
  - `POST /api/organizations` and `POST /api/platform/organizations` generate the slug from the name when none is sent.
  - A password reset link and a sign-in link that return to an app's domain open at that domain under `/api`, so a sign-in link's cookie belongs to the domain the person lands on.
  - The password reset, password changed and sign-in link emails are sent with the organization and the app they were asked for on.
  - Email templates receive the organization (`id`, `name`, `slug`, `metadata`), its `courseApp` and `communityApp`, the `requestedApp` of a sign-in email, and the `recipient` (`email`, and the `id`, `firstName` and `lastName` of the person who has that address).
  - The event calendar file leaves the event page link out when no app serves the community.
  - An emailed invite for a role with no permissions is a `409` when it names no domain and the organization has no app that serves courses.
  - A session of a person who is no longer in its organization answers `401` on every organization route, where it answered `403`. The bundled student app signs that session out and shows the sign-in page.
  - The bundled student app's password reset and sign-in link pages name the organization in the tab title.
  - The admin's Settings → Apps lists, creates, changes and deletes apps. A refused save shows why on the field, and resending an invite or adding a student shows the API's reason when it is refused.
  - The API does not start when `ADMIN_APP_URL` or `BETTER_AUTH_URL` is not an `http` or `https` address.

  Breaking:

  - `PLATFORM_HOST` (`Config.platformHost`) is removed, and creating an organization no longer creates its first host. Create the organization's app with `POST /api/apps`.
  - `CLIENT_ORIGIN` no longer lists the student app's origin by default (`http://localhost:8001` only). Remove a frontend's origin from it before making that origin an app's domain.
  - `hosts` leaves the organization, platform and MCP organization payloads, and `PATCH /api/organizations` no longer takes it. Manage apps under `/api/apps`.
  - `createInvite` and `resendInvite` take `domain` in place of `host`, as do the MCP tools `invite_person` and `resend_invite`; `update_organization` loses `hosts`. A request that still sends `hosts` or `host` is answered as before, with the field ignored.
  - `OrganizationService.createOrganization` and `updateOrganization` no longer return `hosts`, `createOrganization` takes `{ name, slug? }`, and `PlatformOrganizationDetails` loses `hosts`.
  - The connected app routes move from `/api/access/apps` to `/api/access/connected-apps`; the `ApiKeys` port's `listApps` and `revokeApp` become `listConnectedApps` and `revokeConnectedApp`.
  - `TemplateContext.hosts` is replaced by `organization`, `courseApp`, `communityApp`, `requestedApp` and `recipient`. `Mailer` takes `MailerSources` in place of a hosts function, and `Mailer.send` takes the app id as its fifth argument.
  - `OrgHostSettings`, `OrgHostSettingsParams`, `OrgHostIndex` and `DrizzleOrgHostIndex` are removed, with the `Hosts` type and the `hostSchema` and `hostsSchema` schemas; `domainSchema` validates an app's domain. `OrganizationServiceParams` loses `hosts`, and `MemberReportServiceParams.hosts` is replaced by `apps`.
  - `OrganizationService` loses `isOrgHost`, `isHostOfPerson` and `getOrgUsersForUser`, and gains `appOfPerson`, `sessionOrganization`, `acceptsSession`, `acceptsSwitch` and `linkDomain`. `OrganizationServiceParams` takes `apps`, the `OrgApps`, and `IdentityServiceImpl` takes `sessions`. `UpdateOrganizationInput` loses `hosts`.
  - The sign-in adapter's `orgHosts` option (`OrgHosts`) is renamed `appDomains` (`AppDomains`), and its `hasFor` is replaced by `linkDomain`, which says whether a sign-in or reset link is sent and at which domain it is written.
  - The sign-in adapter's `beforeCreateSession`, `sendResetPassword`, `onPasswordReset` and `sendMagicLink` hooks receive the domains the request names (`{ domains }`) as their second argument.
  - Migration `0023_apps` creates the `apps` table and drops the two host indexes on `settings`. An organization created before it has no app until one is created.

### Patch Changes

- Updated dependencies [[`ad97bb3`](https://github.com/mdwt/headless-lms/commit/ad97bb337be2f7c09c49f0888ca44fdaaeb62834)]:
  - @headless-lms/core@0.12.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`0a1d250`](https://github.com/mdwt/headless-lms/commit/0a1d250f710ac697f07d93b346350363f89316ed)]:
  - @headless-lms/core@0.11.0

## 0.3.0

### Minor Changes

- [#35](https://github.com/mdwt/headless-lms/pull/35) [`8a4f692`](https://github.com/mdwt/headless-lms/commit/8a4f69250aa9535954e5b724985169826b7b137e) Thanks [@mdwt](https://github.com/mdwt)! - An organization holds where its member apps are reached: a `courses` host and a `community` host, both always set. A new organization starts with one host for both, its slug as a subdomain of the new `PLATFORM_HOST` variable (`https://example.com` gives `https://acme.example.com`), The organization carries its `hosts` wherever it is returned, and `PATCH /api/organizations` takes `hosts` to replace them. Links in emails, member invites and event calendar files use the organization's hosts at the moment the link is written: communities, spaces, posts, chats and events link to `community`, courses, lessons and downloads to `courses`.

  `createInvite` and `resendInvite` take an optional `host`, the app the invite link opens; it must be one of the organization's hosts.

  Breaking: `STUDENT_PORTAL_URL` and `Config.studentPortalUrl` are removed; set `PLATFORM_HOST` (`Config.platformHost`) instead. The slug sent to `POST /api/organizations` must be lowercase letters, numbers and hyphens, at most 50 characters. `TemplateContext.studentPortalUrl` is replaced by `TemplateContext.hosts` (`{ courses, community }`, `null` for an email sent outside an organization), `Mailer.send` takes the organization id as its fourth argument in place of a context override, and `MemberReportServiceParams.studentPortalUrl` is replaced by `hosts`.

### Patch Changes

- Updated dependencies [[`b57078e`](https://github.com/mdwt/headless-lms/commit/b57078e0299aeee8f796f9170f6b9155720debb5), [`8a4f692`](https://github.com/mdwt/headless-lms/commit/8a4f69250aa9535954e5b724985169826b7b137e)]:
  - @headless-lms/core@0.10.0

## 0.2.4

### Patch Changes

- Updated dependencies [[`e6ea327`](https://github.com/mdwt/headless-lms/commit/e6ea327d00ed2d84411bbc882dbf51f3fed33f68), [`41766f7`](https://github.com/mdwt/headless-lms/commit/41766f7e66c9614857855e832d05082d7b1bdea7), [`932f883`](https://github.com/mdwt/headless-lms/commit/932f883c8a287e349083d2849a5ccc20a007e141), [`c9a3c48`](https://github.com/mdwt/headless-lms/commit/c9a3c48a547aad25b57d5602da63fb2c35ba3d6a), [`eb3ab88`](https://github.com/mdwt/headless-lms/commit/eb3ab88e7e294d035640c5a7cd55edd3bbfeb24d)]:
  - @headless-lms/core@0.9.0

## 0.2.3

### Patch Changes

- Updated dependencies [[`ca0f1da`](https://github.com/mdwt/headless-lms/commit/ca0f1da6ce3f92f2cfd0ec02d63df006f8dd0ac8)]:
  - @headless-lms/core@0.8.0

## 0.2.2

### Patch Changes

- Updated dependencies [[`09803d1`](https://github.com/mdwt/headless-lms/commit/09803d113718799a421c6b0c4f5040cf5e5efdd1)]:
  - @headless-lms/core@0.7.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`5906dfa`](https://github.com/mdwt/headless-lms/commit/5906dfa2c2ff2f05a913f0e73ec5911af37b06c7), [`0f1c31c`](https://github.com/mdwt/headless-lms/commit/0f1c31c68cfa57059446b3ef5b7665f54d8f4f98), [`6924b0d`](https://github.com/mdwt/headless-lms/commit/6924b0d941ba149e3c7a8ee250e9e487ef8edf1e)]:
  - @headless-lms/core@0.6.0

## 0.2.0

### Minor Changes

- [`4f7fde0`](https://github.com/mdwt/headless-lms/commit/4f7fde0636b5829c477f194334b90f2299576905) Thanks [@mdwt](https://github.com/mdwt)! - Events: a content type with a time, a time zone, a location (a venue with its address, a meeting link, or both), a recording, attached files and settings (`public` or `private`, a capacity, notifications on or off, and replay). Staff create, edit, publish, cancel and delete events through `/api/events` and the MCP event tools; members list, open and register through `/api/member/events`, and get a calendar file per event. Going to an event is a grant: registering, staff adding someone, an API client and the automations Grant access action all call `entitlements.grant`, which holds every event rule, takes a capacity lock and counts the attendees under it. Attendees are notified when they are added or removed, when the event moves or changes place, when it is canceled, and a day and an hour before it starts. The admin overview counts upcoming events, and each event has attendee and analytics reads.

  `entitlements.revoke` takes a person and a content id. `entitlements.ensureGrant` is removed: automations grant through `grant`, so granting again makes a revoked or expired grant active with the new expiry. The service sets a grant's `source` from the caller (`self`, `automation` or `manual`); `GrantEntitlementInput` no longer takes one.

  Domain events carry `metadata.actorId`, renamed from `actorOrgUserId`, and so do the request context and notifications (`actorId`, column `actor_id`).

  `ContainerConfig.databasePool` sizes the API's Postgres pool: `max`, `idleTimeoutMillis` and `connectionTimeoutMillis` (`DATABASE_POOL_MAX`, `DATABASE_POOL_IDLE_TIMEOUT_MS` and `DATABASE_POOL_CONNECTION_TIMEOUT_MS` in the API). Unset values keep pg's defaults.

  Breaking: `actorOrgUserId` is `actorId` in domain event metadata and notifications; `EntitlementsService.ensureGrant` and `EntitlementsRepository.insertIfAbsent` and `setExpiresAt` are removed; the entitlements `SpaceReader` port is `ContentReader`.

- [`f6096c4`](https://github.com/mdwt/headless-lms/commit/f6096c4922e176321639c265a8fb4f4d173dd2dc) Thanks [@mdwt](https://github.com/mdwt)! - These packages are released again, built against the current `@headless-lms/core`.

  - `@headless-lms/editor`: a config stores the asset id of a media node, never its URL. `EditorProps` takes `assetUrls` (the URLs the host's API returned, keyed by asset id) and optional `slots`; `Renderer` takes `assetUrls`; an editor declares `assetIds(config)`. `refreshUrl` is removed from the playback callbacks.
  - `@headless-lms/adapter-email-templates`: templates for events, reactions, mentions, course activities, the post digest, role assignment (replacing `youAreNowAModerator`), forgot password and access granted through a bundle.
  - `@headless-lms/adapter-workflow-hatchet`: each notification delivery runs as an engine task; deliveries and scheduled jobs retry with exponential backoff; one pending run per job key; imports come from the SDK's v1 and rest entry points; Hatchet's log lines go through the API's logger; the worker no longer exits the process before the server closes.
  - `@headless-lms/adapter-storage-s3`: `publish` and `publicUrl` serve public, immutable copies of images under `public/`, from `publicBaseUrl`.
  - `@headless-lms/adapter-email-resend`, `@headless-lms/adapter-email-ses`: a permanent refusal (a 4xx other than 408 and 429) throws `EmailRejectedError`, so it is not retried.

### Patch Changes

- Updated dependencies [[`b1e591a`](https://github.com/mdwt/headless-lms/commit/b1e591aec98dd633713f55ee99f424853ea3bd41), [`28b6239`](https://github.com/mdwt/headless-lms/commit/28b6239a2995088e33f877598e4fa116e54a49d3), [`d902c10`](https://github.com/mdwt/headless-lms/commit/d902c1070ca1603a35ef0b525ba0c7899034abec), [`4f7fde0`](https://github.com/mdwt/headless-lms/commit/4f7fde0636b5829c477f194334b90f2299576905), [`5364095`](https://github.com/mdwt/headless-lms/commit/536409507d9d4956027c323fca8fdc5d60f19276), [`2a80581`](https://github.com/mdwt/headless-lms/commit/2a805817f266f5fd61b949f842622941b6262927), [`86a39a0`](https://github.com/mdwt/headless-lms/commit/86a39a04c887fddd787cb700bd40c2f9368907d6), [`96a06eb`](https://github.com/mdwt/headless-lms/commit/96a06eb1fd501da91f2324bedbb57ed3d3c4e866)]:
  - @headless-lms/core@0.5.0

## 0.1.0

### Minor Changes

- 0f137b9: Initial public release

### Patch Changes

- Updated dependencies [0f137b9]
  - @headless-lms/core@0.1.0
