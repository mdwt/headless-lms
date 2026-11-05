# @headless-lms/adapter-auth

## 0.4.0

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

### Patch Changes

- Updated dependencies [[`28b6239`](https://github.com/mdwt/headless-lms/commit/28b6239a2995088e33f877598e4fa116e54a49d3), [`2e99dd4`](https://github.com/mdwt/headless-lms/commit/2e99dd427b59ee7aed21572ebfc12b8039323998), [`d902c10`](https://github.com/mdwt/headless-lms/commit/d902c1070ca1603a35ef0b525ba0c7899034abec), [`5364095`](https://github.com/mdwt/headless-lms/commit/536409507d9d4956027c323fca8fdc5d60f19276), [`2a80581`](https://github.com/mdwt/headless-lms/commit/2a805817f266f5fd61b949f842622941b6262927), [`521a1c1`](https://github.com/mdwt/headless-lms/commit/521a1c11f2785dca67cb5c5b55a905ce4d3efcde)]:
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
