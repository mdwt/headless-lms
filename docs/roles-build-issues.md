# Configurable roles: build log and issues

Spec: `docs/roles-spec.md`. Reviews: `docs/roles-spec-review.md`. Branch `feature/configurable-roles` in `headless-lms` and `hlms-community`.

Baseline at `451cdc5a`: `pnpm build` passes, `pnpm test` 1982 tests in 159 files pass.

## Test stack

- Database `headless_lms_roles` on the local Postgres (`localhost:8005`), all migrations through `0017_configurable_roles` applied.
- Hatchet `headless-lms-hatchet-roles` (gRPC `localhost:8028`, dashboard `localhost:8029`), its own database `hatchet_roles`, so no other stack's worker picks up these jobs.
- API `localhost:8200`, admin `localhost:8201`, student `localhost:8202`, community app `localhost:3200`.
- Email: `EMAIL_SINK_DIR` writes every email (JSON + HTML) to a directory; `RESEND_API_KEY` is empty, nothing is sent.

## Progress

| Phase | Scope | Status |
|---|---|---|
| 1 | Permission list, levels, default set, actor, resolution (core) | done |
| 2 | `org_roles`, `role_assignments`, `assets.content_id`, migration (db) | done; applied to a fresh database |
| 3 | Organizations: roles, assignments, rules, people, invites, transfer, removal | done, 33 service tests |
| 4 | Better Auth: roles, adapter writes, refused paths, `ApiKeys` port | done, 74 adapter tests |
| 5 | Server: `resolveActor`, routes and MCP tools on core methods, `operation` | done |
| 6 | Contexts take the actor and check: content, discussion, chats, entitlements, progress, assets, integrations, automations, reporting, notification categories | done; 2114 tests pass, lint clean |
| 7 | Events, notifications, emails | done; role.assigned email verified end to end |
| 8 | Admin app, student app | done: student d1f20d72; admin b20619b8, f13210e2; both verified in the browser per person |
| 9 | Community app (`hlms-community`) | done (4011cef, a58e2ae, da7f491, a024fb8, db5443a), verified in the browser; seed script run against the API |
| 10 | SDK, OpenAPI, MCP catalogue, docs | done (8a743f9c, 39be615b, 6cebd80a, 45d1625f, 30d4f194, bc8924bf) |
| 11 | Tests (section 19) | open |
| 12 | End to end on a running stack | in progress: API scenarios: people and roles 52/52, access and moderation 47/47, custom roles, media and people 39/39, limits and events 10/10 (102 memberships, REST and MCP agree, a demoted creator's key narrows on the next request, org events at version 2); no error lines in the API log |

## Issues

Each issue: status `open`, `fixed` or `wontfix`, and the fixing commit.

| # | Found in | Issue | Status | Commit |
|---|---|---|---|---|
| 1 | Build | Commit `2d9ca69e` (content agent, assets message) also carries the assets agent's in-progress edits to `packages/core/src/assets/service.test.ts`. Content is intact; only the attribution is mixed. | wontfix | 2d9ca69e |
| 2 | E2E, MCP | A key with only course scopes was shown `remove_comment`, `remove_post`, `remove_post_comment` and `list_space_members`: their methods are declared `member` (authors remove their own), so the listing showed them to every token. The call was still refused by core. Tools now carry `listedFor`, used only for listing. | fixed | 7d427077 |
| 3 | E2E, docs | API descriptions and comments still said "staff" (`CreatePost.mode`, comment schemas, identity types). | fixed | 7d427077 |
| 4 | E2E, env | Member invite links pointed at `localhost:8002`: `STUDENT_PORTAL_URL` wasn't set for the test stack. Environment only, no code change. | fixed | env |
| 5 | E2E, roles | A role the org adds gets the key `role_<ksuid>`; the ksuid has capitals, which `roleKeySchema` refused (lowercase only). Giving, inviting with, or deleting an added role answered 400. The schema now allows letters after the first lowercase one; a test covers generated keys. | fixed | 389b43da |
| 6 | E2E, routes | `GET /api/member/org` named the system-only `organizations.getById`. It now names `organizations.portalIdentity`, declared `public`; a server test refuses any route on a `system` operation. | fixed | ae799374 |
| 7 | Apps, SDK | `@headless-lms/sdk` didn't export the new `People` and `Roles` classes, so invites, roles and people were unreachable from the apps. | fixed | ae799374 |
| 8 | Student app (existing) | next-themes logs "script tag inside React component" on every page. Exists before this build; not part of roles. | open (outside roles) | |
| 9 | Student app (existing) | A course sidebar shows 50% while the header shows 0/1 lessons. Exists before this build; not part of roles. | open (outside roles) | |
| 10 | Email (existing) | The member invite email says "invited to Headless LMS", the brand name, not the org's name. Exists before this build; not part of roles. | open (outside roles) | |
| 11 | Review M1 | Changing an invited person's org role checked only the new role, not the role on their invite, and kept the old inviter, so acceptance then failed. | fixed | 027f1a02 |
| 12 | Review M2 | `automations:write` alone could grant access (a `grantAccess` action runs as the system actor), and webhooks received events their author couldn't read. Grant actions now need `access:write`; a webhook needs the read permission of every event it subscribes to. | fixed | cb0a4acc |
| 13 | Review M3 | Refusals weren't logged with the actor, and MCP refusals not at all. The request context now carries the actor; refusals log the permission and item; MCP logs every refusal. | fixed | cb0a4acc |
| 14 | Review L4 | Role and assignment writes didn't re-check `roles:*`/`people:*` under the lock, `unassignRole` read before locking, and the replaced role wasn't locked. | fixed | 027f1a02 |
| 15 | Review L5 | Acceptance didn't check that the inviter still holds `people:write`. | fixed | 027f1a02 |
| 16 | Review L6 | A person could change their own org role by inviting themselves. | fixed | 027f1a02 |
| 17 | Review L7 | `createInvite` created the person before the permission check. | fixed | 027f1a02 |
| 18 | Review L8 | Reset could repeat a role name; a concurrent create returned 500. | fixed | 027f1a02, 1664fe6a |
| 19 | Review L9 | A failed Better Auth or key cleanup after removal returned 500 and left keys alive. Cleanup now retries and logs; the removal answers 204. | fixed | 027f1a02 |
| 20 | Review L10 | An org row whose role no longer lists `org` still contributed; dangling role keys weren't logged at startup. | fixed | 1664fe6a |
| 21 | Review L11 | Reporting's `team` flag ignored the org role. | fixed | d22cb533 |
| 22 | Review L12 | `role.assigned` fired when the org role already gave everything the item role adds. | fixed | d22cb533 |
| 23 | Review L13 | Notification methods took a free `userId`. They now take the member actor. | fixed | ea9b8981 |
| 24 | Review L14 | `requestUpload` stored an unchecked `contentId` for `media:write` holders. | fixed | e0b8eac7 |
| 25 | Review L15 | Some routes did more than one call (invite peek and accept; null-to-404 branches). The invite routes and the reporting, assets, automations and integrations branches are fixed; four content item reads are in progress. | in progress | 027f1a02, 037771fc |
| 26 | Review L16 | Remove-post and remove-comment descriptions said only moderators may call them. | fixed | d04fd04e |
| 27 | Review L17 | The MCP catalogue read the default role set outside organizations; no boundary test. | fixed | 1664fe6a |
| 28 | Review L18 | The 'Member updated' trigger never fired. Acceptance now emits `organization.user.updated`. | fixed | 027f1a02 |
| 29 | Admin, API | A course's learners show without names to `progress:read` holders: `GET /api/entitlements?contentId=` rows carry only `orgUserId`, and names need `people:read`. | open | |
| 30 | Admin, API | A moderator without `communities:read` can't read the community's name or spaces in the admin app (`getCommunity`, `listSpaces`, `listCommunities` need `communities:read`). Comment-flag authors show as "Unknown person" without `people:read`. | open | |
| 31 | Admin, API | The admin community member list has no `opensEverySpace`; the admin app joins the member directory to exclude those people from space candidates. | open | |
| 32 | Admin, API | Roles carry no flag for whether they can be given; the picker infers Owner. | open | |
| 33 | Admin (existing) | Team and Students tables scroll sideways inside the settings column at 1280px. Exists before this build. | open (outside roles) | |
