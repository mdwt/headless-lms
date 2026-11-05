---
"@headless-lms/core": minor
"@headless-lms/server": minor
"@headless-lms/sdk": minor
"@headless-lms/adapter-db": minor
"@headless-lms/adapter-auth": minor
---

Configurable roles and permissions. The fixed roles owner, admin, instructor, moderator and student are replaced by a permission list in code and roles as data: a deployment ships a default set (Owner, Admin, Instructor, Moderator, Member), and an org renames its roles or, through the API, changes them and adds its own. A role is given on the whole org or on one content item (a course or a community); a person's permissions on an item are their org role's plus the role given on that item. Every check is a permission check in a core service method, and nobody can grant a permission they don't hold.

Breaking changes:

- Wire: `role` is gone from org users, members, the member viewer, comment authors, directory entries and community members. Views carry `orgRole: { key, name }` and `isOwner`; people in a community carry `team` and `roleName`; the member viewer adds `permissions` and `orgPermissions`; the member community home adds `viewer.permissions`, `opensEverySpace`, `team` and `roleName`. Invites take a `roleKey`. `dmSettings.memberToStaff` and `staffToAnyone` become `memberToTeam` and `teamToAnyone`. `GET /api/access/scopes` becomes `GET /api/access/permissions` and `GET /api/access/permissions/list`. The session no longer carries `activeMemberRole`.
- New operations for roles and people: list, add, change, reset and delete roles; give and take a role on the org or an item; transfer ownership; cancel and resend invites.
- Events: `organization.role.created`, `.updated`, `.deleted`, `.assigned`, `.unassigned` and `organization.ownership.transferred` are new. `organization.user.*`, `organization.invite.*` and `organization.student.*` move to version 2 without `role`. Automation filters keyed on `role` no longer match; the "Role assigned" trigger filters on `roleKey`, `contentType` and `contentId`.
- Notifications: `moderator.assigned` and the `youAreNowAModerator` email become `role.assigned` and `roleAssigned`; the `staff` reason becomes `moderator`. Review notifications go to holders of `communities:moderate` or `courses:moderate` on the item.
- API keys and connected apps: scopes are permissions from the same list. A key's or token's effective permissions are its scopes intersected with its creator's current permissions. MCP tools take the permission of the core method they call. Webhooks need the read permission of every event they subscribe to.
- `adapter-auth`: every org user who accepts gets a Better Auth membership whose `role` is `owner` or `participant` and never changes with their roles. The `ApiKeys` port is keyed on org and user ids. Better Auth's organization and API key endpoints that would bypass core are refused over HTTP.
- `adapter-db`: migration `0017` adds `org_roles` and `role_assignments` and drops `org_users.role`. No data is carried over; development databases are recreated.
