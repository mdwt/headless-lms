# @headless-lms/adapter-auth

## 0.5.0

### Minor Changes

- [#38](https://github.com/mdwt/headless-lms/pull/38) [`0a1d250`](https://github.com/mdwt/headless-lms/commit/0a1d250f710ac697f07d93b346350363f89316ed) Thanks [@mdwt](https://github.com/mdwt)! - People can sign in from a page on any organization's host. An origin that is one of an organization's `hosts` is trusted beside the origins in `CLIENT_ORIGIN`, and a change of hosts applies from the next request, without a restart. A password reset link or magic link that returns to an organization's host is sent only to a person who is active in that organization.

  The session cookie is host-only when `AUTH_COOKIE_DOMAIN` is unset: it carries no `Domain` and belongs to whichever host served the request, so the API can be served on each organization's own domain under `/api`. Set `AUTH_COOKIE_DOMAIN` to a parent domain (`.example.com`) to share the cookie across its subdomains.

  Breaking: with `AUTH_COOKIE_DOMAIN` unset the cookie no longer carries the API's host as its `Domain`, so it is no longer sent to subdomains of the API's host. `OrgHostSettings` takes an `index` (`OrgHostIndex`; `DrizzleOrgHostIndex` in the database adapter), and a migration adds two indexes on `settings`. `OrganizationService` gains `isOrgHost` and `isHostOfPerson`, and `CreateAuthOptions` takes an optional `orgHosts`.

### Patch Changes

- Updated dependencies [[`0a1d250`](https://github.com/mdwt/headless-lms/commit/0a1d250f710ac697f07d93b346350363f89316ed)]:
  - @headless-lms/core@0.11.0
  - @headless-lms/adapter-db@0.7.0

## 0.4.5

### Patch Changes

- Updated dependencies [[`b57078e`](https://github.com/mdwt/headless-lms/commit/b57078e0299aeee8f796f9170f6b9155720debb5), [`8a4f692`](https://github.com/mdwt/headless-lms/commit/8a4f69250aa9535954e5b724985169826b7b137e)]:
  - @headless-lms/core@0.10.0
  - @headless-lms/adapter-db@0.6.4

## 0.4.4

### Patch Changes

- [#14](https://github.com/mdwt/headless-lms/pull/14) [`ce18ba3`](https://github.com/mdwt/headless-lms/commit/ce18ba386d73e06588253bc8e39c119898b403f2) Thanks [@mdwt](https://github.com/mdwt)! - Sign-in rate limits count each member separately behind a chain of proxies. The container config takes `trustedProxies` (the IPs or CIDR ranges of the proxies in front of the API) and `ipAddressHeaders` (the headers read for the client IP), and passes them to better-auth. A generated installation reads them from `AUTH_TRUSTED_PROXIES` and `AUTH_IP_ADDRESS_HEADERS`, comma-separated. Without them, every request that arrives with more than one address in `X-Forwarded-For` shares one rate limit.

- Updated dependencies [[`e6ea327`](https://github.com/mdwt/headless-lms/commit/e6ea327d00ed2d84411bbc882dbf51f3fed33f68), [`41766f7`](https://github.com/mdwt/headless-lms/commit/41766f7e66c9614857855e832d05082d7b1bdea7), [`932f883`](https://github.com/mdwt/headless-lms/commit/932f883c8a287e349083d2849a5ccc20a007e141), [`c9a3c48`](https://github.com/mdwt/headless-lms/commit/c9a3c48a547aad25b57d5602da63fb2c35ba3d6a), [`eb3ab88`](https://github.com/mdwt/headless-lms/commit/eb3ab88e7e294d035640c5a7cd55edd3bbfeb24d), [`9f13ac2`](https://github.com/mdwt/headless-lms/commit/9f13ac23d37a814749be2599dd703f4b3260003e)]:
  - @headless-lms/core@0.9.0
  - @headless-lms/adapter-db@0.6.3

## 0.4.3

### Patch Changes

- Updated dependencies [[`ca0f1da`](https://github.com/mdwt/headless-lms/commit/ca0f1da6ce3f92f2cfd0ec02d63df006f8dd0ac8)]:
  - @headless-lms/core@0.8.0
  - @headless-lms/adapter-db@0.6.2

## 0.4.2

### Patch Changes

- Updated dependencies [[`09803d1`](https://github.com/mdwt/headless-lms/commit/09803d113718799a421c6b0c4f5040cf5e5efdd1)]:
  - @headless-lms/core@0.7.0
  - @headless-lms/adapter-db@0.6.1

## 0.4.1

### Patch Changes

- Updated dependencies [[`5906dfa`](https://github.com/mdwt/headless-lms/commit/5906dfa2c2ff2f05a913f0e73ec5911af37b06c7), [`0f1c31c`](https://github.com/mdwt/headless-lms/commit/0f1c31c68cfa57059446b3ef5b7665f54d8f4f98), [`6924b0d`](https://github.com/mdwt/headless-lms/commit/6924b0d941ba149e3c7a8ee250e9e487ef8edf1e)]:
  - @headless-lms/core@0.6.0
  - @headless-lms/adapter-db@0.6.0

## 0.4.0

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

### Patch Changes

- Updated dependencies [[`b1e591a`](https://github.com/mdwt/headless-lms/commit/b1e591aec98dd633713f55ee99f424853ea3bd41), [`28b6239`](https://github.com/mdwt/headless-lms/commit/28b6239a2995088e33f877598e4fa116e54a49d3), [`2e99dd4`](https://github.com/mdwt/headless-lms/commit/2e99dd427b59ee7aed21572ebfc12b8039323998), [`d902c10`](https://github.com/mdwt/headless-lms/commit/d902c1070ca1603a35ef0b525ba0c7899034abec), [`4f7fde0`](https://github.com/mdwt/headless-lms/commit/4f7fde0636b5829c477f194334b90f2299576905), [`5364095`](https://github.com/mdwt/headless-lms/commit/536409507d9d4956027c323fca8fdc5d60f19276), [`2a80581`](https://github.com/mdwt/headless-lms/commit/2a805817f266f5fd61b949f842622941b6262927), [`521a1c1`](https://github.com/mdwt/headless-lms/commit/521a1c11f2785dca67cb5c5b55a905ce4d3efcde), [`86a39a0`](https://github.com/mdwt/headless-lms/commit/86a39a04c887fddd787cb700bd40c2f9368907d6), [`96a06eb`](https://github.com/mdwt/headless-lms/commit/96a06eb1fd501da91f2324bedbb57ed3d3c4e866)]:
  - @headless-lms/core@0.5.0
  - @headless-lms/adapter-db@0.5.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`f9faa8f`](https://github.com/mdwt/headless-lms/commit/f9faa8fb287da9c3c8d8f50194155430d63e8516)]:
  - @headless-lms/core@0.4.0
  - @headless-lms/adapter-db@0.4.0

## 0.3.0

### Minor Changes

- Communities with spaces, posts, chats, moderation and member profiles; an MCP server with OAuth sign-in, connected apps and scoped API keys; access-checked proxy URLs for every file; per-person notification preferences; one API error envelope and request limits; security hardening across automations, auth and webhooks. Breaking: an organization no longer edits a person's name or email.

### Patch Changes

- Updated dependencies []:
  - @headless-lms/core@0.3.0
  - @headless-lms/adapter-db@0.3.0

## 0.2.0

### Minor Changes

- [`0ac4296`](https://github.com/mdwt/headless-lms/commit/0ac429661b55b308d60572445927036d398b522f) Thanks [@mdwt](https://github.com/mdwt)! - Bundles, webhook automations, course and student analytics, admin forgot-password, human-friendly automation trigger labels and self-signup externalId linking, plus API spec and content settings fixes.

### Patch Changes

- Updated dependencies [[`0ac4296`](https://github.com/mdwt/headless-lms/commit/0ac429661b55b308d60572445927036d398b522f)]:
  - @headless-lms/core@0.2.0
  - @headless-lms/adapter-db@0.2.0

## 0.1.0

### Minor Changes

- 0f137b9: Initial public release

### Patch Changes

- Updated dependencies [0f137b9]
  - @headless-lms/core@0.1.0
  - @headless-lms/adapter-db@0.1.0
