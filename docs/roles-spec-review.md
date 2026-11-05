# Review: roles and permissions spec

Nov 5, 2026. Spec: `docs/roles-spec.md` (worktree `configurable-roles`). Every part was checked against the code at `451cdc5a` and `hlms-community@89cf14f`, and against Better Auth 1.7.7 in `node_modules/.pnpm/better-auth@1.7.7_*/node_modules/better-auth/dist/plugins/organization` (`BA/`). Code references are `file:line` at those commits, relative to the repo they live in (`HC/` = `hlms-community`). Spec references name sections.

Each item carries a status: `open`, `fixed`, `decided` or `dropped`, with a note after it. Item numbers restart in each part; "review 1 item 2" names an item in another part.

| Part | Found | Status |
|---|---|---|
| 1. Review 1 | 24 items (6 blocking), 5 decisions | All fixed or decided |
| 2. Review 2 | 29 items (6 blocking), 5 decisions | All fixed or decided |
| 3. Code check | Uncovered role decisions, routes without a permission or actor, wrong claims | All corrected in the spec |
| 4. Review 3 | 9 items (6 blocking) | All fixed; checked in part 5 |
| 5. Review 4 | 13 items (4 blocking), 1 decision | All fixed or decided |
| 6. Review 5 | 15 items (2 blocking), 1 decision | All fixed or decided |



## Unresolved

Nothing is open. Part 6's findings and decision are applied, each noted on its item.

## 1. Review 1

The first review, of the spec's first full draft.

Each item also says what happens to it **under a fixed role set**: the model the user now prefers, where the roles are defined in code and orgs only assign them at the org, a course or a community. "Applies" means the finding stands unchanged. "Moot" means it disappears with org-defined roles. "Changes" says how it narrows.

**Verdict:** the direction is right. Permissions are checked instead of role names, assignments are scoped, organizations owns it all, and Better Auth keeps memberships. Most of the spec's claims about today's code check out (sections 1, 6, 7.4, 8, 9.2, 9.4). Six blocking items remain:
- The spec moves the back-office gate to a permission that a course-scoped role carries, while most staff routes have no core check behind them (item 1).
- The Better Auth plan fails in four separate ways (items 2–5).
- `media:read` "wherever held" exposes paid files (item 6).

Under a fixed role set, sections 4.2 (custom roles), 5.3, 10.1 (role CRUD), 10.2 rules 1, 6, 7, 8 and 9, 17.1 and most of 20 go away. Sections 4.3, 4.4, 6–9, 11–15 and 17.2 stay, and so do all six blocking items.

### Wrong

#### Blocking

**1 · fixed · Removing the staff gate leaves most staff routes with no check at all**
Fixed in spec section 7.4, 7.5 and 19.5, in core only. The HTTP gate this fix proposes was not taken: authorization is a service concern, checked in the core method that REST and MCP both call.
Where: 7.3, 7.4, 18 (`packages/core/src/content` row).
Problem: 7.3 says "every service method that **today branches on a role** calls `actor.permissions.has(...)`". Most staff routes have no role branch in core; `resolveScope` is their only guard. 7.4 replaces it with a resolver that accepts any org user, plus `backoffice:access` anywhere, and says the HTTP layer adds no logic of its own. The result: James, an Instructor at `course:crs_1` only, passes `backoffice:access` and then reaches every route whose service has no check. That includes deleting `crs_2`, editing bundles, downloads, entitlements, automations, webhooks and integrations, reading every student, and reading the org overview. Under the spec, `config.permission` is only declared and tested for presence, never enforced.
Evidence: `content/service.ts` has no role check on course, download, bundle, module or activity writes (inventory 2.4: "`actor` is used for event metadata only"). Section 1.2 of the inventory lists `routes/activities.ts`, `bundles.ts`, `courses.ts`, `downloads.ts`, `entitlements.ts`, `integrations.ts`, `dashboard.ts`, `course-analytics.ts`, `students.ts:26-77`, `automations.ts`, `webhooks.ts` and `assets.ts` with "Core check behind it: none". `scope.ts:41` is the only gate today.
Fix: in 7.3, replace "that today branches on a role" with "every service method reached from a staff route or an MCP tool checks the permission its route declares, against the id it acts on". Add a test to 19.1: for every route with a declared permission, a person holding none of it gets 403 from the service, with HTTP bypassed. Make deny by default explicit: the HTTP layer enforces `config.permission` with `anywhere` as a coarse first gate. That is a declaration evaluated by the shared resolver, not route logic. Core then checks the scope.
Under a fixed role set: applies.

**2 · fixed · Better Auth refuses core's own membership and org writes for anyone but the owner**
Fixed in spec section 9.3.
Where: 9.2, 9.3.
Problem: every membership except the owner's gets Better Auth role `member`, and `memberAc` grants only `ac: ["read"]`. Core makes three kinds of write through Better Auth with the actor's headers, and Better Auth checks the *caller's* member role on each:
- `updateOrganization` (`PATCH /api/organizations`) needs `organization:update`;
- `removeMember` needs `member:delete`;
- `updateMemberRole` needs `member:update`.
So an Admin can no longer rename the org or remove anyone. These endpoints require headers, so they can't be called "as the system".
Evidence: `routes/crud-org.mjs:180-208` (`requireHeaders`, `hasPermission({ organization: ["update"] })`); `routes/crud-members.mjs:142, 197-203` (remove: `member: ["delete"]`) and `:239-240, 287-293` (update-member-role: `member: ["update"]`); `access/statement.mjs` `memberAc`. Core passes the actor's headers at `adapters/auth/src/better-auth.ts:588-600, 644-662`.
Fix: in 9.3, define the Better Auth `member` role with the built-in statements core's writes need (`organization: ["update"]` and `member: ["create","update","delete"]`, so `adminAc` minus `ac` writes), and keep `organization: ["delete"]` on `owner`. State that Better Auth's own checks then always pass and core is the only gate. That is safe only because every HTTP path except the allowlist is refused (item 3). Add a 19.9 test: an Admin who isn't the owner renames the org and removes a person.
Under a fixed role set: applies.

**3 · fixed · The `before` hook would refuse core's own server calls**
Fixed in spec section 9.3.
Where: 9.3.
Problem: Better Auth runs `hooks.before` for `auth.api.*` calls as well as HTTP requests. The current refusal (`UNMIRRORED_ORG_ENDPOINTS`) tests only `ctx.path`. Extending it to "every other `/organization/*` path" also refuses the server calls core depends on:
- `/organization/create`, from `POST /api/organizations` through `orgProvider.createOrganization(req.headers, …)`;
- `/organization/update`;
- `/organization/delete`;
- `/organization/update-member-role`, needed for the ownership transfer;
- `/organization/remove-member`.
Those calls carry headers, so the `ctx.request || ctx.headers` test used for `/api-key/create` can't tell them apart either. Separately, `add-member` is not an HTTP path: `addMember` is a server-only endpoint with no path, so listing it among the refused paths is wrong.
Evidence: `dist/api/to-auth-endpoints.mjs:29-50` (every `api[key]` call goes through `dispatchAuthEndpoint`), `dist/api/dispatch.mjs:64, 210` (`runBeforeHooks`); `adapters/auth/src/better-auth.ts:243-247`; `packages/server/src/http/routes/organizations.ts:61`; `routes/crud-members.mjs:21-31` (`addMember`, no path).
Fix: in 9.3, refuse `/organization/*` paths outside the allowlist only when `ctx.request` is set, meaning the call arrived over HTTP. Server calls pass. Drop `add-member` from the refused list. Extend 19.9: each refused path answers 403 over HTTP, and core's create, update, transfer and remove succeed.
Under a fixed role set: applies.

**4 · fixed · `membershipLimit` defaults to 100**
Fixed in spec section 9.3.
Where: 9.2.
Problem: when every org user with an account holds a Better Auth membership, `addMember` and `accept-invitation` refuse the 101st member with `ORGANIZATION_MEMBERSHIP_LIMIT_REACHED`. The plugin config doesn't set the limit.
Evidence: `routes/crud-members.mjs:59-62` (`membershipLimit || 100`), `routes/crud-invites.mjs:275-279`; `adapters/auth/src/better-auth.ts:197-202` (no `membershipLimit`).
Fix: in 9.3, add `membershipLimit: Number.MAX_SAFE_INTEGER` (or a function returning it). Add a 19.9 test that adds a member past 100.
Under a fixed role set: applies.

**5 · fixed · Deleting the session stamp breaks the student app and single-org staff**
Fixed in spec section 9.2.
Where: 9.2 ("the learner session stamp is deleted"), 18 (`container.ts` row).
Problem: the stamp in `beforeCreateSession` isn't specific to learners. It sets `activeOrganizationId` for every person with exactly one org user, staff included. The student app never calls `set-active`; it relies on the stamp ("stamped at login"). Better Auth doesn't pick an active org at sign-in. "The active organization is set through Better Auth for everyone" therefore names no caller. With the stamp gone:
- every student-app call loses its org;
- staff who belong to one org land on the org picker.
The community app does call `set-active` (`HC/src/server/session.ts:46`). That call fails for learners today, because they hold no membership, and the spec fixes it.
Evidence: `packages/server/src/app/container.ts:801-816`; `apps/student/src/lib/api/server-call.ts:44-49`; `routes/crud-org.mjs:379-433` (`set-active` requires `checkMembership`).
Fix: keep `beforeCreateSession`, and make it pick the org from Better Auth memberships instead of org users. Delete only the admin comment that explains it (`server-session.ts:80-83`). Alternatively, specify that the student app calls `set-active` for its configured org, as the community app does. Name one choice in 9.2.
Under a fixed role set: applies.

**6 · fixed · `media:read` wherever held opens every paid file; `media:write` at org only blocks course instructors**
Fixed in spec section 4.6 and 5.1.
Where: 4.4, 5.1 (`media:read` levels `any`, `media:write` level `org`), 16 step 3.
Problem: the media library serves a signed URL for any ready library file in the org, and that includes the files of paid downloads and other courses' lessons. Because 4.4 applies `media:read` wherever it is held, an Instructor assigned to one course can fetch every file in the org without a grant. That contradicts requirement 8. In the other direction, uploading needs `media:write`, which applies at org level only. James can edit lessons in Spanish Basics but can't upload an image or video for them.
Evidence: `packages/server/src/http/routes/assets.ts:178-205` (`libraryFile(orgId, id)`: any ready library file, no owner check); `:36-182` (uploads behind `staff`).
Fix: drop the "wherever held" rule for `media:read`, so it applies at org level. Specify that a course-scoped `courses:write` holder may upload assets attached to that course, and read the files linked to it, through the activity-asset routes. `backoffice:access` stays the only permission that applies wherever it is held.
Under a fixed role set: applies.

#### Gaps

**7 · fixed · Team is derived from the org role only, so scoped Instructors and Moderators lose their badge and DM status**
Fixed in spec section 4.7.
Where: 4.5, 12 (wire `team`, `roleName`), 15.2, 15.3.
Problem: the spec's main use cases are James as Instructor at `course:crs_1` and Emma as Moderator at `community:cmy_1`. Both have Member as their org role, so neither is team:
- James's replies in his own course show no badge, where today an instructor's do.
- Emma isn't listed under "Team" in the directory, where today a moderator is.
- DMs to Emma follow `memberToMember`, and a first message to her becomes a message request.
That is a regression from today.
Evidence: `apps/student/src/components/player/discussion/comment-item.tsx:86`; `HC/src/app/(community)/members/page.tsx:31-32` (Team means not a student, so moderators count); `packages/core/src/discussion/chats.ts:146, 974-978`.
Fix: in 4.5, resolve team at the scope of the item. A person is team in a course or community when the role assigned there shows as team, or else when their org role does. `roleName` is that role's name. Chats are community-scoped (`adapters/db/src/schema/discussion.ts:373`), so DM rules resolve at the chat's community, and lesson comments resolve at the course.
Under a fixed role set: applies. With fixed roles, "shown as team" becomes a code attribute of each role rather than an editable `showAsTeam` flag.

**8 · fixed · Moderators get chat moderation and comment restore/approve, but no route to use them**
Fixed in spec section 14.
Where: 5.1 (Moderator column), 20 ("Moderator default", "Moderator and the admin app").
Problem: Moderator gets `chats:moderate` and `community_moderation:write` but no `backoffice:access`, so the staff API is closed to them (5.1: `backoffice:access` covers "the staff API"). The member API has no message-flag queue and no route to restore or approve a post comment. Those exist only as staff routes. Two of the abilities in the Moderator column therefore can't be used.
Evidence: staff-only `GET /api/communities/:communityId/message-queue` (`routes/communities.ts:291`) and `/api/communities/:communityId/comments/:commentId/restoration` (`routes/community-moderation.ts:356`). `routes/member/comments.ts` has no restoration or approval route; `routes/member/chats.ts` has lock, unlock and flag resolution but no queue.
Fix: add `GET /api/member/communities/:communityId/message-queue`, `POST /api/member/comments/:commentId/restoration` and `POST /api/member/comments/:commentId/approval` to 14, each one call to the existing core method. Add them to 15.3.
Under a fixed role set: applies.

**9 · fixed · Permissions of people other than the caller are unspecified**
Fixed in spec section 7.6.
Where: 7.1–7.3, 18.
Problem: the spec resolves the *caller's* permissions (`permissionsFor`) and lists holders (`holders`). Several decisions need the permissions of someone else, or of many people at once, and the spec maps none of them:
- `AuthorRoleReader` (`authors.roleOf` / `rolesOf`) is used for:
  - the author's skip-review when a scheduled post fires (`posts.ts:330`) and when a post is restored (`:480`);
  - whether a scheduled post can still be submitted (`:796-801`, through `opensSpace`);
  - the target's team side in DMs (`chats.ts:850, 863`).
- `AccessFacts.role` decides `opensSpace` for many people at once (`spaceOpenersAmong`, `entitlements.ts:483-491`).
- `AuthorRecord.role` drives every author badge (`discussion/ports.ts:75`, `discussion/authors.ts:25`).
- Invite candidates in a space exclude people who open every space, using another person's role, in both apps (`HC/.../spaces/[spaceId]/members/page.tsx:117`, `apps/admin/.../spaces/[spaceId]/members/page.tsx:8,46`). The spec gives other people only `team` and `roleName`.
- Actors are also built outside a request: `community-mail.ts:56`, the scheduled-post job, `member/files.ts:43` and `member/devices.ts:24`. 7.1 covers sessions and tokens only.
Evidence: `packages/server/src/app/container.ts:432-441`; the lines above.
Fix: add to 7.3:
- `OrganizationService.permissionsOfMany(orgId, orgUserIds, scope)`, which returns `EffectivePermissions` per person in one query;
- an `AuthorPermissionReader` port in discussion and entitlements that replaces `AuthorRoleReader` and `AccessFacts.role`;
- `opensEverySpace: boolean` on directory rows and space-member candidates;
- a statement that system-built actors resolve through `permissionsFor`.
Add `container.ts:432-441` to 18.
Under a fixed role set: applies.

**10 · fixed · Escalation: demoting, removing, resetting, and invites accepted later**
Fixed in spec section 10.2 and 13.
Where: 10.2 rules 1–3, 13.
Problem: rule 2 checks only the role being *given*, which leaves these holes:
- A holder of `team:write` who lacks some of Admin's permissions can set an Admin's org role to Member (Member needs nothing), demote a Moderator, or remove a person who holds more than they do (`students:delete` on a Member who has an Instructor role at a course).
- Resetting a default role brings back the code version's permissions with no check, so a `roles:write` holder without `content:preview` restores it to every Instructor.
- An invite is checked when it is created, and the assignment is stored when it is accepted (13). By then the inviter may have been demoted or removed.
- The `access:write` alternative in 10.1 contradicts the catalog text for `team:write` ("assign and remove roles") and for `access:write` ("Grant, change and revoke access").
Evidence: spec 10.1, 10.2, 13
Fix:
- Rule 2: the assigner holds, at that scope, every permission of both the role being replaced and the role being given. Removing a person needs every permission they hold anywhere.
- Rule 1 covers reset.
- 13: acceptance re-checks the inviter's current permissions, and the invite fails when they no longer suffice.
- Either drop the `access:write` alternative or write it into both catalog rows (see D3).
Under a fixed role set: the reset part is moot. Demotion, removal and the invite re-check apply.

**11 · fixed · Event payloads change with no version, and stored automation filters on `role` stop matching**
Fixed in spec section 12.1.
Where: 12.1, 14.
Problem:
- `publicOrgUser` and `publicInvite` carry `role`, and `organization.user.*`, `organization.student.*` and `organization.invite.*` all publish it. 14 removes `orgUserSchema.role` and changes the values in `invites.role` (`student` becomes `member`), with no version bump. The notifications spec's precedent is a version bump plus a line in the requirements (`docs/notifications-spec.md:41, 1386`).
- Automation filters match `event.data` generically by key, so a stored `{ role: 'student' }` filter silently never matches again.
- 12.1 says the new trigger replaces "the role filter on 'Member updated'". No such dedicated filter exists.
- The `organization.student.*` events and the "Students" trigger category are named after a role, and the spec doesn't say when they fire now that every invite creates an org user.
Evidence: `packages/core/src/organizations/events.ts:15-39, 60-112`; `packages/core/src/automations/service.ts:86-100, 264`; `packages/core/src/automations/catalog.ts:142-177`.
Fix: in 12.1, list the changed events:
- `organization.user.*` version 2, with `orgRole: { key }` in place of `role`;
- `organization.invite.*` version 2, with a role key;
- for `organization.student.*`, either retire it or define it as "an org user was created with org role Member".
Replace the "role filter" sentence with: "filters keyed on `role` match nothing; 'Role assigned' filters on `roleKey` and `scope`". Add a line to requirements 11 and 12 saying which org-visible events change.
Under a fixed role set: applies. The role keys become a fixed enum, which makes the payloads easier to document.

**12 · fixed · When a learner's membership is created, and the mirror activates invited learners**
Fixed in spec section 9.2.
Where: 9.2, 13.
Problem:
- "Created when they accept or their account is linked" needs a Better Auth user, because `addMember` calls `findUserById`. The link happens in `beforeUserCreate`, *before* that user exists, so creating the membership on link needs an after-create hook, which the spec doesn't name.
- The mirror `beforeAddMember → addOrgUser` updates an existing org user to `status: 'active'`. Creating the membership on link would therefore activate an invited learner who never accepted, and skip `organization.invite.accepted`.
- Magic link has `disableSignUp: true`, so learners sign up by password first. The spec should state that.
Evidence: `routes/crud-members.mjs:44-45`; `packages/server/src/app/container.ts:784-799, 839-845`; `packages/core/src/organizations/service.ts:163-166`; `adapters/auth/src/better-auth.ts:192-196`.
Fix: in 9.2, create the membership only on acceptance (`acceptInvite` calls `grantMembership` for every role) and drop "or their account is linked". In 18, the mirror's `addOrgUser` keeps the existing status instead of forcing `active`.
Under a fixed role set: applies.

**13 · fixed · "Learner", the Students list and the Team list have no definition**
Fixed in spec section 10.2 and 10.4.
Where: 5.1 (`students:*`, `team:*`), 10.3, 14.
Problem: today these depend on `role = 'student'`:
- the students report and student record (`adapters/db/src/repositories/admin.ts:296, 371, 394`);
- the team list and its pending invites (`members.ts:59, 75`);
- resend and delete, which work "only for students" (`organizations/service.ts:316, 460`).
The spec doesn't say who is on which list, or whether `students:delete` or `team:write` removes James (org role Member plus an Instructor role at a course). Removing a learner now also has to remove their Better Auth membership, because `deleteOrgUser` (`service.ts:454-470`) deletes the row directly and would leave the membership behind.
Evidence: lines above.
Fix: define both lists in 10.3:
- Students: org users whose org role is Member, scoped roles included, with a column for those roles.
- Team: org users with any other org role, or any scoped role.
In 13, name one removal operation: it deletes the Better Auth membership (the mirror then deletes the org user), it needs `team:write` when the person holds any role other than Member anywhere and `students:delete` otherwise, and item 10's rule applies.
Under a fixed role set: applies.

**14 · fixed · Scoped holders: route gates and lists are unspecified**
Fixed in spec section 7.4.
Where: 4.4, 7.2, 7.3.
Problem: `has(p)` with no scope asks the org level. Several routes take no item id, among them `GET /api/courses`, `GET /api/comments`, `GET /api/students`, the media library and `GET /api/overview`. The spec doesn't say whether James gets 403 or a filtered list from them. `students:read` and `analytics:read` at course level ("a learner's record" of which course?) and `access:read` at a community have no defined result.
Evidence: spec 4.4 ("they see only the items their permissions reach"), with no list rule.
Fix: add to 7.3: a list route admits a caller who holds its permission `anywhere`; the service filters to org level, or to the ids where the caller holds it, with the ids passed to the repository. `students:read` at a course lists the course's grant holders. Add a 19.2 case: James lists courses and sees only `crs_1`.
Under a fixed role set: applies.

**15 · fixed · The invite flow change has side effects the spec doesn't cover**
Fixed in spec section 13.
Where: 13.
Problem: under the new rule that every invite creates the person and an `invited` org user straight away:
- The team list shows pending staff both from `invites` (`members.ts:75`) and as an invited org user, so they appear twice.
- Cancelling an invite (`removeMember`'s invite branch, `service.ts:684-694`) leaves the org user behind.
- An invited Admin shows as an invited learner until they accept.
- It isn't said what happens when the invitee is already an org user.
- 13 names the permission for roles holding `backoffice:access` (`team:write`) and for Member (`students:invite`), but not for any other role. Moderator is one: it has no `backoffice:access` and isn't Member.
Evidence: `packages/core/src/organizations/service.ts:247-287, 670-700`; `adapters/db/src/repositories/members.ts:59-75`.
Fix: in 13:
- Cancelling an invite deletes an org user who is still `invited` and holds no grant.
- An invite for an existing org user only stores the role, which takes effect on acceptance.
- Inviting with any role other than Member needs `team:write`.
- The team list reads invited org users and no longer reads `invites`.
Under a fixed role set: applies.

**16 · fixed · Ownership transfer isn't atomic and is under-specified**
Fixed in spec section 10.3.
Where: 10.1, 10.2 rule 4, 12.1.
Problem: moving the Better Auth `owner` role takes two `updateMemberRole` calls with the owner's headers, in a fixed order. The new owner must be promoted first; if the old owner is demoted first, Better Auth answers `YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER`. Core must also update `organizations.owner_id`, store Admin as the previous owner's org role, and delete the new owner's org-scope row. That is four writes across two stores. A failure partway leaves two Better Auth owners, or an `owner_id` that disagrees with Better Auth.
Evidence: `routes/crud-members.mjs:271-284`; `container.ts:822-831` (`owner_id` set from the Better Auth creator).
Fix: in 10.2 rule 4, specify the order: promote the new owner in Better Auth, then run one core transaction (`owner_id`, the previous owner's row set to Admin, the new owner's row deleted, the event), then demote the old owner in Better Auth. If the last step fails, core's `owner_id` is authoritative and a repeat of the transfer completes it. Add a 19.5 case for a failure after the first step.
Under a fixed role set: applies.

**17 · fixed · Deleting a course or community has no mechanism for removing its assignments**
Fixed in spec section 12.1.
Where: 17.2 ("Deleting a course, community or org user deletes its assignments").
Problem: `scope_id` is polymorphic, so no foreign key can enforce this. Content can't write organizations' table. Until the assignments go:
- holder counts include them, which blocks rule 7's role deletion;
- `holders` returns people for an id that no longer exists.
No `organization.role.unassigned` is emitted for these removals.
Evidence: `packages/core/src/content/events.ts:124-125, 263-264` (`content.course.deleted`, `content.community.deleted` exist).
Fix: in 17.2, organizations subscribes to `content.course.deleted` and `content.community.deleted`, deletes the matching rows, and emits `organization.role.unassigned` for each. The org user foreign key cascades with `on delete cascade`.
Under a fixed role set: applies. The holder-count effect is moot.

**18 · fixed · Recipient filters disagree**
Fixed in spec section 12.2.
Where: 8 (last two rows), 12.2.
Problem: 12.2 limits moderator recipients to "active community members". `message.flagged` and lesson-comment `content.flagged` go to bare `holders(...)`. A holder of `chats:moderate` without `communities:enter` and without a grant then hears about a community they can't open, and an `invited` org user counts too.
Fix: one rule in 12.2: every permission-based audience is `holders(...)` intersected with active org users. For a community it is also intersected with community members, and for a course with people who can open it.
Under a fixed role set: applies.

**19 · fixed · The worked example has errors**
Fixed in spec section 16.
Where: 16.
- Step 8: Sarah holds every permission and is a member of every community through `communities:enter`, so the recipients are Sarah and Emma (and any Admin), not "Emma".
- Step 11: nothing assigns "Community manager" to Emma. She holds Moderator from step 6.
- Step 9: Moderator's levels already include `community` (5.1), so "adding level `community`" changes nothing.
- Steps 1, 3, 8 and 9 read and write `roles`, but the table is `org_roles` (17.1).
- `holders('chats:moderate', …)` leaves out `orgId` (7.3 signature).
Fix: correct each one. Add a step where Sarah assigns "Community manager" to Emma, so step 11 holds.
Under a fixed role set: steps 9 and 11 are moot. Replace them with a fixed-role step, such as Sarah assigning Instructor to James at a second course. Step 8 and the table name apply.

**20 · fixed · Holding no place: existing rows and unpublished communities**
Fixed in spec section 6.
Where: 6.
Problem:
- When someone gains `community_moderation:read` in a community, their existing `space_members` rows stay `active`, so they keep counting in `countActiveSpaceMembers`. When the role is removed, they have no places left.
- Today, staff are members of unpublished communities as well (`communityMember` skips the publish test), but the spec doesn't say whether `communities:enter` covers unpublished communities.
Evidence: `adapters/db/src/repositories/grant-covers.ts:75-81` against `holdsCommunity` at `:71-73`; `entitlements.ts:615-631`.
Fix: in 6, state that place rows stay and are ignored while the person opens every space, that counts exclude them, and that `communities:enter` covers unpublished communities as staff membership does today.
Under a fixed role set: applies.

**21 · fixed · The community app can't know the lesson-review permission, and its notification copy is missed**
Fixed in spec section 12.2, 14 and 15.3.
Where: 14 (`MemberViewer.permissions` "at org level"), 15.3.
Problem: the org `review` category (reported lesson comments) is shown in the community app's settings by `me.staff` (`HC/src/app/(community)/notifications/settings/page.tsx:41`). Its permission, `comments:moderate`, applies at course level, so James, who holds it only at `crs_1`, never sees the category even though he receives the notifications. Separately, `HC/src/lib/notifications.ts:165-167, 174, 216` renders `moderator.assigned`, and 15.3 doesn't list it.
Fix: `MemberViewer.permissions` lists the permissions held anywhere, with `orgPermissions` for the org level. Better, the server sends only the categories that apply to the viewer, which keeps this rule out of the client. Add `lib/notifications.ts` (`role.assigned`) to 15.3.
Under a fixed role set: applies.

**22 · fixed · Docs, website, SDK and tests left out of section 18**
Fixed in spec section 18.
Where: 18, 19.
- Website docs: `apps/website/content/docs/mcp/permissions.mdx:14-17,29` (lists roles); `architecture.mdx:32-46` ("Learners never hold memberships or roles"); `building-a-frontend.mdx:26-30` ("staff always").
- Website code: `apps/website/components/mcp/scope-matrix.tsx`, `tool-catalogue.tsx:20`, `catalogue.ts:25,70`, and `lib/mcp-catalogue.json`, which `apps/api/scripts/gen-mcp-docs.ts` produces from `mcpCatalogue()`. `public/openapi.json` and the API reference pages come from `pnpm gen:sdk`.
- SDK: generated, so no hand edits, but `hlms-community` vendors it and needs the regenerated copy.
- Tests: 37 test files and `packages/server/src/http/mcp/test-support.ts:18,68` (`toolContext(role: StaffRole)`) build actors with role names. 19 needs a test helper that builds an actor from permissions.
- Email templates: `adapters/email-templates/src/emails/member-invite.tsx:13,26`, `community.tsx:282-291` and `index.tsx:42,105-107`. 18 names templates but not their registration.
- Seeds and the `apps/api` scripts: nothing else. No seed script exists, and `gen-openapi.ts` has no role logic.
Fix: list each of these in 18, and add "regenerate the SDK, the OpenAPI document and the MCP catalogue" as a step.
Under a fixed role set: applies.

**23 · fixed · The lint rule catches code that isn't role logic, and needs exceptions**
Fixed in spec section 8.
Where: 18 (last paragraph), 19.12.
Problem: `member`, `owner` and `admin` aren't distinct strings. Comparisons such as `member.kind !== 'member'` (`organizations/service.ts:547, 683`) and `asset.source === 'member'` (`assets/service.ts:113-344`) would fail the rule. The adapter must also name the Better Auth roles `owner` and `member` (`creatorRole: "owner"`, `better-auth.ts:200`).
Fix: write the rule against identifiers, not literals: ban `role`, `roleKey` or `.role` compared with a string literal, and ban imports of the deleted helpers. Exempt `adapters/auth/src/access.ts`, and `better-auth.ts` for the Better Auth role names.
Under a fixed role set: applies, more so. A fixed set invites `role === 'moderator'` checks back, and the rule is the guard against them.

**24 · fixed · Small inaccuracies**
Fixed in spec section 1 and 9.3.
Where: 1, 9.3.
- Section 1's counts mix call sites with imports and definitions. Excluding tests, `isStaffRole` appears 39 times and `STUDENT_ROLE` 24; `canModerate` (29), `isManager` (57) and the 18 literal comparisons are correct. Say "occurrences".
- 9.3 lists `add-member` as a refused path, but no such HTTP path exists (item 3).
Under a fixed role set: applies.

### Open for a decision

**D1 · decided · Fixed role set (the user's stated preference)**
Decided Nov 5: roles are data. The deployment ships a default set, an org renames its roles, and roles can be changed through the API (spec 4.3, 4.4, 10).
Under a fixed role set, the following go away:
- custom roles and `role_<ksuid>` keys;
- `org_roles` and its copy-on-write, reset and `base` resolution (4.2, 5.3, 17.1);
- the role CRUD routes and `roles:read` / `roles:write` (10.1);
- rules 1, 6, 7, 8 and 9 (10.2);
- unique names, renaming and deleting a role that is assigned;
- the editable Member role and `showAsTeam`;
- the decisions "Default roles" and "Deleting an assigned role" (20).
The following stay:
- the permission catalog in code;
- each role's permissions and levels, now in code;
- `role_assignments`, scoped resolution, `holders`;
- assignment escalation (rule 2), the owner rules, the Better Auth plan;
- the token intersection;
- the events for assignment and ownership.
`roleKeySchema` becomes a fixed enum, which types the SDK. 9.4 shrinks to one reason: Better Auth has no scoped assignments.

**D2 · decided · What Member may hold (moot under D1)**
Decided: Member holds no permissions and can only be renamed (spec 4.2).
The spec allows any catalog permission on Member. If Member holds `content:preview` or `communities:enter`, every learner opens every product without a grant, which breaks the spirit of requirement 8. `holders()` would then also return every org user as an id list for the SQL (7.3). Options: a `member: false` flag on the catalog entries Member can't hold (`backoffice:access`, `content:preview`, `communities:enter` and every `*:write`); or allow it and accept the consequences.

**D3 · decided · Who assigns scoped roles**
Decided: `team:write` only (spec 10.1).
`team:write`, or `access:write` at that scope (10.1). Option (a): `team:write` only, which separates defining roles from assigning them. Option (b): keep the alternative, and write it into the `access:write` row of the catalog.

**D4 · decided · A Moderator with no grant**
Decided: allowed, and the response says the person isn't a member yet (spec 10.5).
Emma assigned at `cmy_1` without a grant moderates nothing and gets no notifications, and nothing tells Sarah. Options: (a) the assignment response flags that the person isn't a community member; (b) Moderator holds `communities:enter` at community level; (c) assigning at a community needs the person to be a member already.

**D5 · decided · `notification_categories:write` at community level**
Decided: the `community` level is added (spec 5.1).
It is org-only, while the community categories are per community (`routes/communities.ts:166-217`). Option: add the `community` level, so a community-scoped role can configure its own community.

## 2. Review 2

After the rewrites that moved levels onto the role, removed `backoffice:access`, took every check out of the routes and made an assignment's scope a `content_id`. `spec:line` is a line of the spec at that point.

**Verdict:** the level model holds together. A permission's `about` against a role's `levels`, item assignments contributing only the item type's permissions, `content_type` on the row and the `(org_user_id, content_id)` key are consistent across 4, 5, 7.3, 7.7, 17.2 and 19.4. The catalog, the default set, the Instructor code block and the decisions table agree. No stale `backoffice:access`, `scopesWith` or `scope_id` wording is left. Six items block an implementation:
- An owner's API key or app holds every permission whatever its scopes (item 1).
- Several operations have no core method to hold their check, and one of them lets any org user, learners included, rename the org (item 2).
- `EffectivePermissions` can't answer "team" or the role's name, but 4.7, 7.4 and 14 depend on it (item 3).
- A course-level editor can't upload or pick media, and can attach any library file to their course (item 4).
- The "nothing left unchecked" test can't be written as specified (item 5).
- Calls with no person behind them have no way to pass the new checks (item 6).

**Previous review.** Its fixes 2–5, 7–16 and 18–24 hold in the current spec. Item 1's fix (checks in core) holds for every method that has a core service behind it, but not for the routes in item 2. Item 6's fix ("a `courses:write` holder may upload assets attached to that course") is stated in the catalog but has no mechanism (item 4). Item 17's fix ("organizations subscribes") names a mechanism the code doesn't have (item 9). Item 11's fix misses `organization.student.*` (item 13). Decision D5 ("`notification_categories:write` gains the `community` level") was replaced when each permission got a single `about`: community categories now fall under `communities:write` (section 8). That is consistent with the new model, but D5's note no longer describes the spec.

### Wrong

#### Blocking

**1 · fixed · The owner flag bypasses the token intersection**
Fixed in spec 7.2 and 7.3: the owner holds the whole list as a set, intersected with token scopes like anyone else.
Where: 7.2, 7.3, 11; requirement 12.
Problem: `has` returns true as soon as `this.owner` is set, before any token scope is consulted (`spec:385`). `resolvePermissions(rows, defaultRoles, tokenScopes)` "intersects the sets" with the token's scopes, but `owner` is a separate boolean that the intersection doesn't touch. An API key Sarah made with only `courses:read`, or an MCP app she consented to with `community_moderation:read`, can therefore do everything the owner can: delete courses, change roles, remove people. The same holds for `where` and `anywhere`, which 7.3 doesn't show. `resolvePermissions` also receives no input that tells it who the owner is: the rows are assignments, and the owner has none (`role_key` is never `owner`, 17.2).
Evidence: `spec:328-331`, `spec:369-387`; `adapters/db/src/schema/organizations.ts:16-18` (`owner_id` references `users.id`, not an org user).
Fix: in 7.2, give `resolvePermissions` the org's `ownerId` and the org user's `userId`. In 7.3, state that with token scopes `owner` is never set: the owner's set is the whole permission list, intersected with the scopes like anyone else's. Show `has`, `anywhere` and `where` all reading the intersected sets. Add a 19.12 case: the owner's key with `courses:read` is refused `deleteCourse` and `setOrgRole`.

**2 · fixed · Operations with no core method behind them: any org user renames the org, and the key checks stay in a route**
Fixed in spec 7.4 and 10.1: `updateOrganization`, the `ApiKeys` methods and the notification-category methods take the actor and check.
Where: 7.4, 9.3, 10.1, 11, 18 (`packages/server/src/http`, `organizations` rows).
Problem: the spec puts every check in "the method of the context that owns the action", but these routes call a port or the auth adapter directly. Nothing in core sits on the path:
- `PATCH /api/organizations` calls `orgProvider.updateOrganization(req.headers, …)`, and Better Auth then calls the mirror `organizations.updateOrganization(id, organization)` with no actor. Today Better Auth's own role check refuses instructors. Under 9.3 every membership's Better Auth role `member` holds `organization: ["update"]`, and `resolveActor` accepts any org user. So any org user, a learner included, renames the org or changes its slug, and `org:update` is checked nowhere.
- API keys and connected apps: `assertRoleHoldsScopes` runs in the route, then `container.auth.createApiKey` / `listApiKeys` / `deleteApiKey` / `listConnectedApps` / `revokeConnectedApp`. Section 11 renames the helper but doesn't say which core method calls it, so `api_keys:write` and the subset rule would stay in the transport.
- Org and community notification categories: `notificationCategories.org.get/replace/reset(orgId, orgId, …)` and `.community.*(orgId, communityId, …)` take no actor, and today `resolveConfiguratorScope` guards them. Under the spec, `notification_categories:write` and `communities:write` have nowhere to be checked. `GET /api/notification-types`, `/notification-channels` and `/notification-categories/defaults` have no permission named at all.
Evidence: `packages/server/src/http/routes/organizations.ts:86-91, 341, 359, 378, 399`; `packages/server/src/app/container.ts:833-835`; `packages/core/src/organizations/service.ts:128`; `BA/routes/crud-org.mjs:171-208`; `BA/access/statement.mjs:25`; `packages/server/src/http/routes/access.ts:35-36, 54, 73, 92, 110-118, 137`; `packages/server/src/http/routes/communities.ts:177-178, 197, 218`; `packages/core/src/organizations/notification-categories.ts:36, 51, 69`.
Fix: in 7.4, add "Operations that end in Better Auth or another adapter go through a core method that takes the actor, checks, and then calls the port." Name them in 10.1 and 18:
- `OrganizationService.updateOrganization(actor, input)` requires `org:update` and then calls `orgAdmin().updateOrganization`; the mirror hook keeps its actor-less write.
- `OrganizationService.createApiKey(actor, input)`, `listApiKeys(actor)`, `deleteApiKey(actor, id)`, `listConnectedApps(actor)` and `revokeConnectedApp(actor, clientId)` sit behind an `ApiKeys` port that the auth adapter implements. Creation requires `api_keys:write` and `assertHoldsPermissions`.
- `NotificationCategoryService.get/replace/reset` take the actor. `replace` and `reset` require `notification_categories:write` on the org, or `communities:write` on the community. Name the permission for the reads and the defaults.
Add to 19.13: a person whose org role is Member gets 403 from `PATCH /api/organizations`.

**3 · fixed · `EffectivePermissions` can't answer team or the role's name**
Fixed in spec 7.1 and 7.3: `roleOn` on `EffectivePermissions`, also returned by `permissionsOfMany`.
Where: 4.7, 7.1, 7.4 ("Named decisions"), 7.6, 14.
Problem: team is an attribute of the role, not a permission (4.2 `team`). `EffectivePermissions` exposes `has`, `require`, `anywhere` and `where`, and nothing about roles. Yet 7.4 defines `isTeam(permissions, itemId)`. 14 sends `team` and `roleName` "resolved on the item" for comment authors, directory rows and community members. 7.6 gives other people only `permissionsOfMany` and `AuthorPermissionReader`, which return permissions. With the interface as written, none of the badge, "Team" section, DM-rule or message-request decisions (8, "Shown as team") can be computed.
Evidence: `spec:307-312`, `spec:439`, `spec:460-462`, `spec:695`; `packages/core/src/discussion/chats.ts:146, 974-978` (today's team decisions, made from another person's role); `packages/core/src/discussion/authors.ts:25`.
Fix: in 7.1, add `roleOn(on?: ContentId): { key: string; name: string; team: boolean }` to `EffectivePermissions`. It returns the role given on that item, or the org role when there is none. `isTeam(permissions, itemId)` reads it. In 7.6, state that `permissionsOfMany` and `AuthorPermissionReader` return the same object, so `roleOn` works for other people too. In 7.3, add the per-item role key, name and team flag to what `resolvePermissions` builds.

**4 · fixed · Course and download editors can't upload or pick media, and can attach any library file**
Fixed in spec 5.1 and 7.4 (media), 17.3 (`assets.content_id`), test 19.7.
Where: 5.1 (`courses:write`, `downloads:write`, `media:*`), 4.3 (Instructor), 18.
Problem: `courses:write` claims "upload and read the media attached to it", but nothing ties an upload to a course:
- `requestUpload(orgId, input)` registers an org library asset with no course, behind the library routes, which need `media:write`. Default Instructor doesn't hold `media:write`, so James can't upload a lesson video.
- The editor picks existing files from `GET /api/assets`, which needs `media:read`. James doesn't hold that either.
- In the other direction, `saveActivity` accepts any ready library asset id in the org (`assertLibraryAssets` → `libraryAssetsAmong`), and the lesson then serves that file to anyone who can open the lesson. A course-scoped editor who knows an asset id can attach a paid download's file to their own course and fetch it with `courses:preview`. `addDownloadAsset` and course or download thumbnails behave the same way.
- `downloads:write` claims nothing about media, so a download-level editor can't add files to their own download.
Evidence: `packages/core/src/assets/service.ts:110-147`; `packages/server/src/http/routes/assets.ts:36-60, 92-110`; `packages/core/src/content/service.ts:357-374, 383, 538`; `packages/server/src/http/routes/member/files.ts:106-128`.
Fix: in 5.1 and 7.4, specify the media rule:
- An upload request may name a content item (`contentId`). `requestUpload` requires `media:write` on the org, or the item's write permission on that item, and records the item on the asset.
- `saveActivity`, `addDownloadAsset` and the thumbnail fields accept an asset only when the actor holds `media:read` on the org, or the asset was uploaded for the same item.
- Listing files for the picker is a method filtered the same way: the whole library with `media:read`, otherwise the files uploaded for that item.
- Give `downloads:write` the same media wording as `courses:write`.
Add to 18: `packages/core/src/assets` and `adapters/db` assets gain the item column. Add to 19.6: James uploads to `crs_1`, is refused an upload for `crs_2`, and is refused attaching an asset that wasn't uploaded for `crs_1`.

**5 · fixed · The "nothing left unchecked" test can't be written as specified**
Fixed in spec 7.5: permission, `member` or `system` per public method; seeded fixtures; `operation` on routes and tools.
Where: 7.4 ("Member-side methods"), 7.5, 18, 19.1, 19.6.
Problem:
- 7.5 says a core test calls "every declared method with an actor who holds nothing and expects `ForbiddenError`". But 7.4 says member-side methods that every member may call need no permission, so they would pass for a holder of nothing.
- Methods that load first and check against what they loaded (7.4 "Against the item's own data", the `remove` example) answer `NotFoundError` to a holder of nothing unless the test seeds the item.
- "Fails for a method a person can reach that is missing from the declaration": core can't know what a person can reach, because routes and MCP tools live in `@headless-lms/server`, which core may not import.
- Routes and tools have no link to the method they call. Today a tool carries only `scope`, and a route only its handler, so "route descriptions naming the permission, read from the declarations" and "MCP tool listing from the method declarations" (18) have nothing to read.
Evidence: `spec:437`, `spec:445-447`, `spec:416-421`, `spec:811`; `packages/server/src/http/mcp/tool.ts:15-26`; `AGENTS.md` import boundaries.
Fix: in 7.5, specify:
- The declaration maps every public method of a service to one of: a permission, `member` (any org user, with what the method checks itself), or `system` (no person; see D3). A test reads each service class's prototype and fails for a public method missing from the map.
- The deny test runs on seeded fixtures (an org, one item of each type, a post, a comment, a chat). Every method declared with a permission, called with an actor who holds nothing, throws `ForbiddenError`.
- Each route's config and each tool name the method they call (`operation: 'content.deleteCourse'`). A server test fails for a route or tool without one, and the descriptions and the MCP listing read the permission through it.

**6 · fixed · Calls with no person behind them have no way to pass the checks**
Fixed in spec 7.2: the system actor for system work; work for a person runs as that person.
Where: 7.1, 7.2 ("Work done without a request"), 7.5.
Problem: 7.2 covers jobs that act for a person (the scheduled post). Other callers act for nobody: the automation action "grant access" calls `grants.grant(event.orgId, …)` on the same method an admin reaches through `POST /api/entitlements` and the `grant_access` tool. When that method takes an actor and requires `access:write`, as 7.4 and 18 say, the automation has no actor to pass. The spec doesn't say whether system callers use a separate method, a system actor or the workflow author's actor.
Evidence: `packages/core/src/automations/actions.ts:195`; `packages/core/src/entitlements/service.ts:64`; `packages/server/src/http/routes/entitlements.ts:57`; `packages/server/src/http/mcp/tools/people.ts:85`.
Fix: add to 7.2 the rule for system callers (D3). List every method that a system caller and a person both reach, starting with `EntitlementsService.grant`, and add a 19.6 case for each.

#### Errors and gaps

**7 · fixed · Ownership transfer hard-codes the `admin` key**
Fixed in spec 10.3: the request names the previous owner's new org role, default `member`.
Where: 10.3 step 2, 19.9; 4.3; requirement 8.
Problem: the transfer makes "the previous owner's org role Admin". A deployment may replace the set with one that has no `admin` (4.3's own example ships Owner, Host, Moderator and Member), and the startup check requires only `owner` and `member`. The step also reads a role key to decide something, which requirement 8 forbids outside the system roles.
Evidence: `spec:114`, `spec:116`, `spec:618`, `spec:35`.
Fix: in 10.3, `POST /api/organizations/ownership` takes the previous owner's new org role key (default `member`). It must name an org-level role of the org, and rule 2 is skipped because the owner holds everything. Update 19.9.

**8 · fixed · Core's Better Auth writes need a session, which keys, apps and MCP don't have; REST accepting keys is new**
Fixed in spec 7.2, 9.3 and 11: core writes to Better Auth server-side without user headers; REST stays session-only and keys stay on MCP, as today.
Where: 7.2, 9.2, 9.3, 10.1 ("The MCP server gets the same operations as tools"), 10.3, 19.12.
Problem:
- Removing a person and transferring ownership call Better Auth's `remove-member` and `update-member-role`. Both require headers and a session (`orgSessionMiddleware`), and the adapter forwards the caller's request headers. An MCP tool or an API key call has no session, so these operations fail when 10.1 offers them as tools.
- 7.2 has REST verify "session cookie, API key or OAuth token", but today REST accepts sessions only (`requireOrgSession` → `auth.verify` → `getSession`), and keys and tokens are verified only at `/mcp`. Accepting keys on REST is a new behaviour the spec doesn't call out (D4).
Evidence: `adapters/auth/src/better-auth.ts:644-662`, `:531-552`; `BA/routes/crud-members.mjs:139-143, 236-240`; `packages/server/src/http/plugins/auth.ts:60-83`; `packages/server/src/http/mcp/route.ts:43-60`.
Fix: in 9.3, state the credentials core uses for each Better Auth write:
- removal deletes the membership through a server-only adapter method that takes no headers (the adapter writes the `member` row through Better Auth's adapter, as `grantMembership` uses the server-only `addMember`);
- transfer does the same for both role changes.
Then removal and transfer behave the same from REST, MCP and keys. In 7.2, state which transports accept which credentials (D4).

**9 · fixed · "Organizations subscribes" to content deletions names a mechanism that doesn't exist, and breaks requirement 7**
Fixed in spec 12.1 and 17.2: a foreign key to `content_items` with `on delete cascade`, no subscription.
Where: 12.1 (last paragraph), 7.9 ("A content item is deleted"), 5.4, requirement 7, 18.
Problem:
- The only event subscriber is `automations.handle`, through `subscribeAll`. Contexts don't subscribe to events, so "organizations subscribes to the deleted event of every content type" has no wiring.
- Listing one subscription per type ("and each type added later") means every new content type changes organizations. That contradicts requirement 7 and 5.4 ("The assignment table, the check, the actor and the routes don't change").
- Delivery goes through the outbox relay, so the assignments outlive the item until the relay runs. `holders` and holder counts include them in that window.
Evidence: `packages/server/src/app/container.ts:726-727`; `packages/core/src/content/events.ts:124-125, 263-264`.
Fix: in 12.1, name the mechanism: an automations derivation on every `content.*.deleted` event that calls `OrganizationService.removeAssignmentsOn(orgId, contentId)`. The derivation is selected by an event-type pattern, or by one `content.item.deleted` event content emits for every type, so a new type adds nothing in organizations. State that `holders` and `actorFor` ignore assignments whose item the content port no longer finds. Say the same in 7.9.

**10 · fixed · The race rules don't hold without locks**
Fixed in spec 7.4: advisory locks on role keys and org users, re-read under the locks.
Where: 7.4 ("Writes to roles and assignments re-check the actor inside their own transaction"), 7.7 ("Removing a level … refused while the role is given"), 10.2 rules 2 and 8, 12.1.
Problem: re-reading the actor inside a read-committed transaction doesn't stop a concurrent change that commits between the read and the write. Specific races:
- An assignment and a level removal on the same role both pass their checks.
- Deleting an org-added role and giving it pass together, which leaves a `role_key` that names nothing.
- Two `team:write` holders set James's org role at once, and rule 2's "role being replaced" check runs against a role that is no longer there.
- A demotion of the editor commits while their role change is mid-transaction.
- `assignRole` reads the item's type, the item is deleted and its deletion handled, then the insert commits, which leaves an orphan.
A role in the deployment's set that has no stored row has nothing to lock.
Evidence: `spec:441`, `spec:473`, `spec:603`, `spec:609`, `spec:664`.
Fix: in 7.4, specify:
- Every role and assignment write takes a transaction-scoped advisory lock on `(org_id, role_key)` for each role it reads or changes, and on `(org_id, org_user_id)` for the target and for the actor. The actor's permissions and the target's current assignment are then re-read under those locks.
- Resolution ignores an assignment whose `role_key` names no role, and 9's cleanup ignores an item that is already gone.
Add a 19.8 case for each race above.

**11 · fixed · Replacing the deployment's set leaves dangling assignments and stored rows**
Fixed in spec 4.3 and 7.9.
Where: 4.3 (startup checks), 5.3, 7.9 ("The deployment replaces its default set and restarts").
Problem: the startup check validates the new set by itself. It doesn't look at stored data:
- assignments whose `role_key` the new set no longer has;
- `org_roles` rows for such a key, and added roles whose `base` is gone;
- assignments at a level the new version of a role no longer lists (Instructor shipped as `org` only, with James still on `crs_1`);
- stored permissions that no longer fit the new levels;
- base defaults for a newly added permission that don't fit an added role's own levels.
7.7's refusal to remove a level that is in use covers only the API.
Evidence: `spec:114-122`, `spec:267`, `spec:473`, `spec:490`.
Fix: in 4.3, add the rules for an existing database:
- an assignment or stored row whose key the set lacks resolves to nothing and is listed in the startup log;
- an assignment at a level its role no longer lists contributes nothing;
- `resolvePermissions` keeps only permissions that fit the role's current levels, whether they are saved or come from the base.
State that in 7.9 and add a 19.2 case.

**12 · fixed · Rule 1 lets an editor strip permissions from roles held above them**
Fixed in spec 10.2 rule 1: before and after.
Where: 10.2 rule 1; requirement 9.
Problem: rule 1 checks only the result of a change ("refuses when the result holds a permission the editor doesn't hold"). An editor with `roles:write` who lacks `automations:write` can still remove `automations:write`, or `team:write`, from Admin. That demotes every Admin at once. Requirement 9 ("Nobody can … change a role … beyond what they hold themselves") forbids it. Rule 2 already checks both sides for assignments.
Evidence: `spec:36`, `spec:602-603`.
Fix: rule 1 becomes: changing, adding or resetting a role needs every permission the role holds before and after, on the org. A rename needs `roles:write` only. Add the case to 19.8.

**13 · fixed · `organization.student.*` still carries `role` and keeps its version**
Fixed in spec 12.1: `organization.student.*` and `.linked` at version 2.
Where: 12.1, requirement 14.
Problem: `organization.student.created`, `.deleted` and `.linked` publish `publicOrgUser`, which includes `role`. 14 removes `orgUserSchema.role`, so their payloads change. 12.1 keeps their name and says nothing about the version, and requirement 14 says events that carried `role` change version. `organization.student.linked` and `organization.user.linked` are not mentioned at all.
Evidence: `packages/core/src/organizations/events.ts:15-25, 60-65, 95-112`.
Fix: in 12.1, list `organization.student.*` (including `.linked`) and `organization.user.linked` at version 2 without `role`, and say when `organization.student.linked` fires.

**14 · fixed · Implications name permissions that don't exist; `about: null` and `org` disagree**
Fixed in spec 5.2: implications per permission; `about` typed as `Level`; `api_keys:read` and `notification_categories:read` added.
Where: 5.2, 5.1, 19.1.
Problem: "Every `*:write` implies its `*:read`" covers `api_keys:write` and `notification_categories:write`, which have no `*:read`. 19.1 ("every implication names a permission") would then fail. `community_moderation:write → community_moderation:read` repeats the general rule. Separately, the code block has `about: null` for the org, while the table, 4.5, 7.7 and `levelSchema` use `'org'`, so the fit check needs a mapping between them.
Evidence: `spec:164`, `spec:166`, `spec:230`, `spec:238`, `spec:249`, `spec:261`, `spec:826`.
Fix: in 5.2, write the implications per permission instead of as a rule. Use `about: 'org'`, typed as `Level`, so `about` and `levels` share one type. Update 19.1 ("an `about` that is a level").

**15 · fixed · Removing a person doesn't revoke their keys and app consents**
Fixed in spec 10.2 rule 3 and 7.9.
Where: 7.9 (last row), 11.
Problem: the spec says the keys "stop working" and that removal "revokes" them. They stop only because `actorFor` finds no org user. The key and the consent remain in Better Auth, carrying the user id and the org, so they work again if the person rejoins the org.
Evidence: `adapters/auth/src/better-auth.ts:401-427` (the grant carries `userId` and `orgId`); `packages/server/src/http/mcp/route.ts:54`.
Fix: in 7.9 and 11, removal deletes the person's API keys for the org and revokes their consents and refresh tokens, through the `ApiKeys` port of item 2, in the removal method. Add to 19.12: a removed and re-invited person's old key is refused.

**16 · fixed · Overlapping permissions don't fit "the permission each method requires"**
Fixed in spec 5.2: `analytics:read` and `students:read` imply the item-level reads.
Where: 5.1, 7.5.
Problem: some reports are reachable through two permissions:
- `analytics:read` (org) "every analytics report", against `course_learners:read` (a course's analytics) and `community_analytics:read`;
- `students:read` (org) "open a learner's record", against `course_learners:read` "the course's learners, their progress".
The declaration names one permission per method. A role that holds `analytics:read` without `course_learners:read` is then refused the course analytics that its catalog row promises, or the method needs an either-of check that the declaration can't express.
Evidence: `spec:169`, `spec:174`, `spec:188`, `spec:200`, `spec:445`.
Fix: in 5.2, `analytics:read` implies `course_learners:read` and `community_analytics:read`, and `students:read` implies `course_learners:read`. Org-level implications then cover every item. Keep one permission per method in the declaration.

**17 · fixed · The permission labels are gated behind `roles:read`**
Fixed in spec 5.2 and 10.1: the list is open to any org user.
Where: 10.1 ("List the permissions"), 11, 14.
Problem: the key-creation screen and the OAuth consent screen show each scope with its label. Today `GET /api/access/scopes` serves that to every staff member. 14 replaces it with `GET /api/access/permissions`, which returns keys only, while the list with labels needs `roles:read`. An Instructor who holds `api_keys:write` can't label their own key's scopes, and a person consenting to an app can't read what they grant.
Evidence: `spec:581`, `spec:700`; `packages/server/src/http/routes/access.ts:24-37`; `apps/admin/src/app/(auth)/oauth/consent/page.tsx:48-50, 74`.
Fix: in 10.1, `GET /api/access/permissions/list` is open to any org user. It is the code list and holds nothing private.

**18 · fixed · Which permissions a token can carry, and the files that list them, are unstated**
Fixed in spec 11 and 18.
Where: 11, 18.
Problem: "A key's or app's scopes are permissions" makes all ~46 permissions token scopes. That includes `roles:write`, `team:write`, `api_keys:write`, `courses:preview` and `communities:enter`. Dynamic client registration defaults to every scope, and the discovery document advertises them. The spec doesn't say whether that is intended. Section 18 also omits the files that hold today's scope list.
Evidence: `adapters/auth/src/better-auth.ts:101-102` (`scopes` and `clientRegistrationDefaultScopes` from `ACCESS_SCOPES`); `packages/server/src/http/well-known.ts:11` (`scopes_supported`); `adapters/auth/src/access-grant.ts:3, 68-90`.
Fix: in 11, state which permissions a token may carry: either every permission, or the list minus a named set. In 18, add `well-known.ts` and `access-grant.ts` to the `packages/server/src/http` and `adapters/auth` rows, reading that list.

**19 · fixed · The escalation rules are ambiguous at item level, and a Member invite can demote**
Fixed in spec 10.2 rules 2 and 3, and 13.
Where: 10.2 rules 2 and 3, 13.
Problem:
- Rule 2: "every permission of both … roles, on that scope". Read literally, giving Instructor on `crs_1` needs `api_keys:write`, which the assignment never contributes there (4.6).
- Rule 3: "every permission they hold anywhere" doesn't say where the remover must hold each one. Holding `courses:write` on `crs_2` shouldn't let you remove someone who holds it on `crs_1`.
- 13: an invite for an existing org user "stores only the role, which takes effect on acceptance". With Member as the role it needs only `students:invite`, not rule 2. A `students:invite` holder can therefore turn an Admin into a Member if the Admin accepts.
Evidence: `spec:603-604`, `spec:680-682`.
Fix:
- Rule 2: the giver holds, at that scope, every permission the replaced and the given assignment contribute there. On an item, that is the role's permissions about the item's type.
- Rule 3: for each place the target holds a permission, the remover holds it there or on the org.
- 13: an invite for an existing org user follows rule 2 against their current org role, whatever the role invited.

**20 · fixed · The `chats.ts:415` before-and-after is wrong**
Fixed in spec 8.
Where: 8 (the before and after).
Problem: the real code exempts staff from two things: the sender check and `requireWritableChat`, so non-staff can't delete their own message in a locked chat. The "after" snippet keeps only the sender check, so a member could delete their own message in a locked chat. It also uses fields that don't exist (`message.senderId`, `chat.communityId`). The message carries `orgUserId` and `communityId`.
Evidence: `packages/core/src/discussion/chats.ts:412-420`.
Fix: replace both snippets with:
```ts
if (!actor.permissions.has('chats:moderate', message.communityId)) {
  if (message.orgUserId !== actor.id) throw new ForbiddenError('You cannot delete this message');
  await this.requireWritableChat(orgId, actor, message.chatId);
}
```

**21 · fixed · Two definitions disagree: team's fallback, and who opens every space**
Fixed in spec 4.7 and 6.
Where: 4.7, 6, 8.
Problem:
- 4.7: "team when the role given to them on that item has `team`, or else when their org role does". This doesn't say whether an Admin who is given a non-team role on a course (an org-added role with `team: false`) is team there.
- `opensEverySpace`: 6 makes `community_moderation:read` open every space only "inside a community a person is a member of", but 8 defines it as "`communities:enter` or `community_moderation:read` on that community", with no membership. Under 8's reading, Emma as Moderator with no grant "opens every space", so she can't be invited to or hold a place in any space, while being unable to open one.
Evidence: `spec:149`, `spec:287-289`, `spec:503`.
Fix: in 4.7, "team when either the role on the item or the org role has `team`" (or state the override if that is the intent). In 8, define `opensEverySpace` as "`communities:enter`, or community membership plus `community_moderation:read`", matching 6.

**22 · fixed · Binding docs that contradict the spec are missing from section 18**
Fixed in spec 18 (Docs row).
Where: 18 (`docs/domain/organizations.md` row).
Problem:
- `AGENTS.md` and `docs/architecture.md` say "Role is a route guard, not a service" and "Access to content is decided only by entitlements". The spec moves every check into the service and adds three permissions that open content.
- `docs/domain/reporting.md` says "The route guard decides whether that role may call the method" and that the admin service is called by "Owner, admin, and instructor".
- `docs/domain/assets.md` defines who uploads, owns, serves and deletes library files as "staff".
- `docs/domain/identity.md` speaks of "which role".
- `entitlements.md`, which 18 names, has no staff wording.
- The email-template contract in core is also left out.
Evidence: `AGENTS.md:32, 37`; `docs/architecture.md:30-41, 101-102, 111-112`; `docs/domain/reporting.md:5, 21, 36`; `docs/domain/assets.md:16-29, 48-53, 60`; `docs/domain/identity.md:12, 30`; `packages/core/src/types/email-templates.ts:91`.
Fix: in 18, add `AGENTS.md`, `docs/architecture.md` ("Access checks", "Reporting"), `docs/domain/reporting.md`, `assets.md` and `identity.md`. Replace `entitlements.md` with the ones that have staff wording. Add `packages/core/src/types/email-templates.ts` (`roleAssigned` replaces `youAreNowAModerator`).

**23 · fixed · Data-model details an implementer will trip on**
Fixed in spec 17.1, 17.2, 4.5 and 18; ownership stays the `owner` row, `owner_id` is untouched.
Where: 4.5, 13, 17.1, 17.2, 18 (`content` row).
Problem:
- `org_users`' primary key is `(org_id, id)`, so `role_assignments.org_user_id references org_users` must be the composite `(org_id, org_user_id)`.
- `organizations.owner_id` and `invites.invited_by` are user ids, not org user ids. `actorFor(orgId, orgUserId)` and the acceptance re-check (13) need the mapping.
- "An org user without an org row has Member" is wrong for the owner.
- Name uniqueness (rule 10) can't be a database index alone, because unchanged roles' names live in memory.
- `name` and `description` are always stored, so a later rename in the deployment's set never reaches an org that changed only permissions.
- A role with no level isn't refused.
- `org_roles.org_id` has no foreign key.
- `base` is "for roles an org added" in 4.2 but a required deployment key in 17.1.
- The content-type port is described ("a port for organizations") but not named.
Evidence: `adapters/db/src/schema/organizations.ts:16-18, 26-58, 69-71`; `spec:94`, `spec:132`, `spec:611`, `spec:765-771`, `spec:780`, `spec:806`.
Fix: in 17.1 and 17.2:
- composite foreign key `(org_id, org_user_id)` with `on delete cascade`, and `org_id` referencing `organizations`;
- `name` and `description` null to keep the deployment's;
- `base` set on every stored row, and equal to `key` for a deployment role;
- `levels` has at least one element;
- name uniqueness checked in core against the org's effective names, plus a partial unique index on `lower(name)`.
In 4.5, "unless they are the owner". In 7.2 and 13, name the user-to-org-user lookups. In 18, declare `ContentTypeReader.typeOf(orgId, contentId): Promise<ContentType | null>` in `organizations/ports.ts`, implemented by content and wired in `container.ts`. It returns null for a bundle, a deleted item or another org's item.

**24 · fixed · Methods take `orgId` and `actor.orgId`, and nothing ties them together**
Fixed in spec 7.1: methods that take an actor read the org from it.
Where: 7.1, 7.2.
Problem: the signatures keep `orgId` beside an actor that now carries `orgId` (`deleteCourse(actor.orgId, req.params.id, actor)`). `has` answers for the actor's org, while the repository writes in the `orgId` argument. A caller that passes a different org, such as a job that builds the actor from one event and calls with another org's id, gets a check for one tenant and a write in another.
Evidence: `spec:301-305`, `spec:345`, `spec:357-359`.
Fix: in 7.1, `require` also throws when the method's `orgId` differs from `actor.orgId`. Alternatively, methods that take an actor drop the `orgId` parameter. Name one choice.

**25 · fixed · Where `Permission` lives, and the import cycle it can create**
Fixed in spec 5.2 and 7.1: `permissionSchema` in `core/types`.
Where: 5.2, 7.1, 12.1.
Problem: `EffectivePermissions.has(permission: Permission, …)` is declared in `core/shared/actor.ts`, while the list is in `organizations/permissions.ts`. Shared would then import a context. Content imports organizations today, and if organizations imports content's events (12.1), the two form a cycle. 5.2 also has "the wire schema exposes `Permission` as an enum" without saying which is the source.
Evidence: `packages/core/src/shared/actor.ts:1`; `packages/core/src/content/titles.ts:1`; `spec:243`, `spec:262`, `spec:320`.
Fix: in 5.2, the permission keys are `permissionSchema` in `core/types/schemas/organizations.ts`. `PERMISSIONS` in organizations satisfies `Record<Permission, PermissionDefinition>`, so the two can't drift. `core/shared/actor.ts` imports the type from `core/types`. State that after the change no context imports organizations for role helpers.

**26 · fixed · "Keep what staff can do today" isn't true for Instructor**
Fixed in spec 4.3, 6 and 20.
Where: 6, 20 ("Opening content without a grant"), 4.3.
Problem: today Instructor is staff everywhere. It is a member of every community, moderates them, opens every course, and holds an API key (`roles.ts` `moderate: true`; `STAFF_ROLES` in `grant-covers.ts`). The default Instructor holds no community permission and previews only the courses it is given on. The decisions table says the three permissions "keep what staff can do today", and section 6 that they "replace today's staff bypass". That holds only for Admin. 4.3's "Holds" for Instructor also omits `api_keys:write`, the only org-level permission it has.
Evidence: `packages/core/src/organizations/roles.ts:74-78`; `packages/core/src/entitlements/rules.ts:14, 23`; `adapters/db/src/repositories/grant-covers.ts:75-81`; `spec:108`, `spec:281`, `spec:862`.
Fix: in 20, "keep what Admin can do today; an Instructor keeps it only on the courses it is given". List what an Instructor gives up in 6. Add "create API keys (as the org role only)" to 4.3's Instructor row. D2 has the choice.

**27 · fixed · Worked example and naming slips**
Fixed in spec 16.
Where: 7.7, 16, 10.1.
- Steps 5 and 6 call `updateActivity`; the method is `saveActivity`.
- 7.7 has `assignRole` checking "On the org, the role must list `org`", while steps 12 and 13 use `setOrgRole`. Name the organizations methods behind each 10.1 row once.
- Step 8 reads nothing; it reads `role_assignments`, `org_roles` and the content port, as step 2 does.
- Step 9's "Practice" space isn't in the example data (section 1).
- Step 13 doesn't show the `role.assigned` notification that James's gain fires (12.2).
- Steps 2 and 8 don't name `team:write`, the permission the giver needs.
Evidence: `packages/core/src/content/service.ts:376`; `spec:470`, `spec:742-753`, `spec:24`.
Fix: correct each one.

**28 · fixed · Small inaccuracies and stale wording**
Fixed in spec 1, 3, 8, 13 and 5.2 (`courses:write` implies `courses:preview`).
Where: 1, 3, 13.
- Excluding tests, `isStaffRole` occurs 38 times and `STUDENT_ROLE` 23, not 39 and 24.
- "Staff carries eight different meanings (section 8)": section 8 has 14 rows.
- Glossary "Team": "People shown as staff of a content item"; 13: "A staff invite no longer waits". Use "team" and "an invite with a role other than Member".
- Section 8's "Moderates lesson comments" row misses `discussion/service.ts:405` (`seesHeld`) and `:607` (post-comment removal), and its "Opens content" row misses `discussion/titles.ts:120`.
- `courses:preview` isn't implied by `courses:write`, so a role holding only `courses:write` edits a course it can't open in the member app.
Evidence: grep at `451cdc5a`; `spec:9`, `spec:60`, `spec:681`; `packages/core/src/discussion/service.ts:405, 607`; `packages/core/src/discussion/titles.ts:120`.
Fix: correct each one. For the last item, either add `courses:write → courses:preview` (and `downloads:write → downloads:preview`) to 5.2, or state that it is intended.

**29 · fixed · The test plan misses the cases above**
Fixed in spec 19.
Where: 19.
Problem: 19 has no case for:
- an owner's token (item 1);
- a Member calling `PATCH /api/organizations` (item 2);
- `roleOn` for other people (item 3);
- item-bound uploads (item 4);
- the declaration coverage test (item 5);
- system callers (item 6);
- MCP removal and transfer (item 8);
- deleting an item while a role is given on it (items 9 and 10);
- a deployment set that drops a key or a level (item 11);
- stripping a role held above you (item 12);
- a rejoined person's old key (item 15).
19.12 ("an API key with all of the role's permissions") can't run for a role given on an item, because such a holder can't create a key (D1).
Evidence: `spec:824-844`.
Fix: add one case for each, under the numbered groups named in the items.

### Open for a decision

**D1 · decided · API keys and apps for people whose role is on an item**
Decided: keys stay as today. `api_keys:write` is about the org; connecting an app needs no permission; tokens are bounded by the intersection (spec 11).
`api_keys:write` is about the org, so a role given on an item never contributes it (4.6). James, Instructor on `crs_1` with Member as his org role, can't create a key, and 19.12 can't run for him. Connecting an app through OAuth needs no permission today (the consent is in Better Auth, and the intersection at each request bounds the token). So James can still reach MCP through an app, but not through a key. The catalog says `api_keys:write` covers "API keys and connected apps".
- (a) Keys and apps are for org-role holders only. The consent page and Better Auth's consent need a check that the person holds `api_keys:write`, and Better Auth's consent is not a core method. Is that check acceptable in the auth adapter, or should consent go through a core method?
- (b) Creating keys and connecting apps is a member-side action with no permission, because the intersection with the creator's permissions already bounds every token. `api_keys:write` is then dropped.
- (c) Keep it as written and say in 11 that apps are ungated while keys need `api_keys:write`.

**D2 · decided · What the default Instructor keeps in communities**
Decided: (a) Instructor teaches courses only (spec 4.3, 20).
Today Instructor is a member of every community and moderates it (item 26). The default set gives it nothing in communities.
- (a) As written: Instructor teaches courses only.
- (b) Instructor also holds `communities:enter` and the community moderation permissions. Its levels then include `community`, and on the org it covers every community, as today.

**D3 · decided · How calls with no person pass the checks**
Decided: (b) the system actor; work for a person runs as that person (spec 7.2).
Item 6.
- (a) A method that a system caller reaches has an unchecked variant reached only through a port (`EntitlementGrants.grant` for automations). The declaration lists it as `system`, and the person-facing method takes the actor and checks.
- (b) A system actor that holds every permission, built by organizations and never reachable from a transport.
- (c) The automation acts as the person who saved the workflow, through `actorFor`. A workflow then stops when its author loses the permission.

**D4 · decided · Which transports accept keys and tokens**
Decided: (b) REST stays session-only, keys and tokens stay on `/mcp`, as today (spec 7.2, 11).
Item 8. Today REST accepts sessions and `/mcp` accepts keys and tokens. 7.2 implies REST accepts all three.
- (a) REST also accepts keys and OAuth tokens, intersected as in 11.
- (b) REST stays session-only and keys and tokens are for `/mcp`. 7.2 and 19.12 are then reworded.

**D5 · decided · Question: is the MCP tool list a transport concern?**
Decided: core exposes `permissionFor(operation)`; the transport only maps tools to operations (spec 7.5).
11 and 7.5 have the MCP server list "the tools whose permission the caller holds anywhere", and the filter runs in `mcp/route.ts` (today `:63-65`). It protects nothing, because the method checks. It is still a decision made in a transport, from the actor's permissions and the declarations. Should it stay in the MCP transport, or should core expose the declaration lookup (`permissionFor(operation)`), so the transport only maps tools to operations? The same question applies to the OpenAPI descriptions read from the declarations.

## 3. Code check

Checks the spec, after review 2's fixes, against the code. A report, not a list of items: every gap it found was corrected in the spec. Tests, generated SDKs and `vendor/` are excluded. Paths are relative to the worktree root unless they start with `hlms-community/`. In 3.2, paths are relative to `packages/server/src/http/` unless they start with `core/` (= `packages/core/src/`) or `adapters/`.

### 3.1 Uncovered role decisions

#### 3.1.1 Backend (core, server, adapters, plugins, `apps/api`)

`plugins/**`, `apps/api/**`, `packages/cli`, `packages/editor` and `packages/create-headless-lms` make no role decisions. No seed script in this repo writes roles; the only role literals in migrations are column definitions (`adapters/db/drizzle/0000_baseline.sql:5,19,308,326`).

| `file:line` | What it decides | Why the spec misses it |
|---|---|---|
| `packages/core/src/discussion/titles.ts:119-124` (`seesComment`, `canModerate` at :120) | Moderating roles, moderator included, get titles and excerpts of other people's held and removed comments, lesson comments and post comments alike | Section 8 cites only `discussion/titles.ts:141`. No row maps `:120`, which would need `comments:moderate` on the course for lesson comments and `community_moderation:read` on the community for post comments. Today a moderator sees held *lesson* comment titles here while `discussion/service.ts:526-527` hides the comments themselves from them |
| `packages/core/src/content/titles.ts:86-93` (`staff` at :92) | Staff get a bundle's name without holding the bundle | Section 8 maps `content/titles.ts:53-92` to `courses:preview` and `downloads:preview` only. A bundle is not a content type in the spec (section 3: course, download, community), and section 6 has no bundle exception, so nothing says which permission opens a bundle title (`bundles:read` on the org is the only candidate) |
| `packages/core/src/discussion/posts.ts:480-486` (`restore`) | Restoring a removed post re-runs review with the **author's** role (`authors.roleOf` :480 → `submissionOf` :485), so a restored post goes back to `pending` unless its author is staff | Section 8's "Skips review" row cites only `posts.ts:949`. Section 7.6 names the author of a scheduled post but not restore. Whose `skipsReview` applies on restore, and on which community, is not stated |
| `packages/core/src/discussion/posts.ts:791-801` (`submittable`) | A scheduled post whose author has no org user any more (`role === null`) goes back to draft. Otherwise it fires only if the author still opens the space, worked out from the author's role | Section 7.2 builds the author with `actorFor(orgId, post.orgUserId)` but doesn't say what happens when that org user no longer exists. Section 4.5 says "an org user without an org row has Member", which would turn a removed author into a Member instead of a refusal |
| `packages/core/src/organizations/service.ts:312-318` (`resendStudentInvite`) | An invite can be resent only for an org user whose role is `student` (404 "Student" otherwise) | Section 5.1 gives `students:invite` "resend an invite". Section 13 creates an `invited` org user for every invite, but the spec doesn't say whether a non-Member invite can be resent or which permission that needs (`team:write`?) |
| `packages/core/src/organizations/service.ts:546-553`, `:606-613` | A role can't be changed for a pending-invite row (`member.kind !== 'member'`), or for a student with no account yet ("That student has not joined yet") | Section 10.4 puts invited people on the Team list, and section 13 says an invite for an existing org user "stores only the role". The spec doesn't say whether `PUT .../roles/org` on an `invited` org user is allowed, is refused, or rewrites the invite |
| `packages/core/src/organizations/service.ts:200-204` (`removeOrgUser`, the mirror of `beforeRemoveMember`) | When a Better Auth membership is removed, a `student` org user is kept and anyone else is deleted with `organization.user.deleted` | Section 9.2 cites only the `demote` flag. Once every accepted person has a membership, this branch decides whether removing a Member's membership deletes the org user. Section 7.9 says removal removes the membership, but not what the mirror hook does with the row |
| `packages/core/src/organizations/service.ts:404` vs `:170` | A student's acceptance emits `organization.student.linked`. A staff acceptance gets `organization.user.linked` from the mirror's `addOrgUser` when the row is new | Section 12.1 redefines `organization.student.*` as "created, or deleted" and leaves out `student.linked`. Under section 13 every invite creates the org user first, so the mirror's `addOrgUser` always finds a row and `organization.user.linked` (:170) never fires again. Which event marks an acceptance is unstated |
| `adapters/db/src/repositories/admin.ts:371`, `:394` (`getStudent`, `studentAnalytics`) | A learner's record and analytics return 404 unless their role is `student` | Section 10.4 redefines only the Students *list*. Whether `students:read` opens the record of someone whose org role isn't Member is unstated, and section 18 names only "the Students and Team queries" |
| `adapters/db/src/repositories/members.ts:136-140` | The Team list sorts by the role string | The role is no longer a string on the row. Sorting by key or by the org's name for the role isn't specified; section 14 covers only the filter |
| `adapters/db/src/repositories/members.ts:24` (`roleOf`) | An unknown or `student` role on a Team row shows as `instructor` | Covered only by deleting `isRole`/`TeamRole`. The spec never states the fallback is gone, nor what a Team row shows for someone who holds only item roles (section 10.4 includes them) |

#### 3.1.2 Apps (admin, student, website, community app)

| `file:line` | What it decides | Why the spec misses it |
|---|---|---|
| `apps/admin/src/app/(dashboard)/page.tsx:23` + `_components/overview-view.tsx` | The landing page calls `serverApi.overview()` for every authenticated user, ungated. Only the enrollment series and the two stats are manager-only. | 15.1 covers `isManager` branches and `requireManager` pages. It doesn't cover `requireAuth` pages whose data call now needs a permission. Under 5.1, `GET /api/overview` needs `analytics:read`, which default Instructor and Member lack. The landing page then throws a 403 for them, and 15.1 says the admin app "opens for any org user". |
| `apps/admin/src/components/app-shell/nav.ts:28-41` with `lib/roles.ts:76-79` | Content (Courses, Downloads, Communities, Bundles) and Media show for every role. The comment says "anyone who builds course content can manage media". | `visibleNav` is replaced (15.1), but these pages use `requireAuth` only: `media/page.tsx:15`, `downloads/page.tsx:18`, `communities/page.tsx:15`, `bundles/page.tsx:19-20`, `(community)/moderation/page.tsx:12`. Default Instructor holds no `media:read`, `downloads:read`, `communities:read` or `bundles:read`, and nothing in 15.1 names gating these `requireAuth` pages. |
| `apps/admin/src/app/(dashboard)/settings/api-keys/page.tsx:15` | The API-key scope picker offers `listAccessScopes()` options where `allowed`. | 15.1 doesn't name it. Section 14 replaces `GET /api/access/scopes` with `GET /api/access/permissions` (`{ org, content }`), which has no option list and no `allowed` flag. Section 11 sets the rule ("subset of what the creator holds anywhere") but not what this page reads. |
| `apps/admin/src/lib/auth/oauth-flow.ts:66-75` (`pickerScopes`), `apps/admin/src/app/(auth)/oauth/consent/page.tsx:48-49, 74` | OAuth consent offers only scopes whose `allowed` is true. The copy says "your role in {org} doesn't include". | Section 11 says the consent screen offers only held scopes. The client reads `{scope, allowed}[]`, which section 14 removes, and 15.1 names neither file. |
| `apps/admin/src/app/(dashboard)/settings/team/members-columns.tsx:43, 144` | `member.role === "owner"`: the owner's role control shows as a badge only, and Remove is disabled. | Section 14 replaces `Member.role` with `orgRole`. No wire field tells the app who the owner is (`organizations.owner_id`, 17.3). Comparing `orgRole.key === "owner"` is a role-key comparison, which requirement 8 forbids, and 15.1 gives no replacement. |
| `apps/admin/src/app/(dashboard)/students/actions.ts:25` | "Add student" invites with the literal `role: "student"`. | The default set has no `student` key (it is `member`, 4.3), so this write fails `roleKeySchema` (section 14). 15.1 doesn't name the student invite action; only the "Make moderator" and "Remove moderator role" actions are named. |
| `apps/admin/src/app/(dashboard)/communities/[communityId]/spaces/[spaceId]/members/page.tsx:8, 46` | `STAFF = new Set(["owner","admin","instructor"])`. People with a staff role are left out of the space-member candidates. | The deleted list names the community app's `STAFF`, not this one, and 15.1 says nothing about space-member candidates. Section 14's `opensEverySpace` on "space-member candidates" exists, but the admin consumer isn't named. |
| `apps/admin/src/app/(dashboard)/courses/[courseId]/discussion/_components/comment-body.tsx:89-91` | `reply.author.role !== "student"` shows a badge with the raw role key. | 15.2 names this change for the student app only. 15.1 has no bullet for the admin course-discussion badge, which section 14 breaks (`commentAuthorSchema.role` becomes `team`/`roleName`). |
| `apps/admin/src/app/(dashboard)/communities/[communityId]/(community)/settings/_components/direct-message-settings.tsx:27, 32` | The DM settings form edits the keys `memberToStaff` and `staffToAnyone`. | Section 14 renames them to `memberToTeam` and `teamToAnyone`. 15.1 doesn't name the admin form; 15.3 names only the community app's reader. |
| `apps/admin/src/components/status-badge.tsx:88-90` (`RoleBadge`) | Picks the badge variant by role key: `owner` gets brand, `admin` neutral, everything else outline. | "Badges show the role's name" covers the label, not a style keyed on the role key. The lint rule in section 8 refuses `role === "owner"`. |
| `apps/admin/src/components/app-shell/user-menu.tsx:37`, `apps/admin/src/app/(dashboard)/settings/account/account-view.tsx:38` | Show the signed-in user's own role label (`ROLE_LABEL[user.role]`). | `ROLE_LABEL` is removed (15.1), and the stated feed, `GET /api/access/permissions`, carries no role name. Only `MemberViewer` gets `orgRole.name`, and the admin app doesn't read it. Nothing names where the admin app gets the viewer's role name. |
| `apps/admin/src/lib/auth/server-session.ts:107-116` + `apps/admin/src/app/onboarding/page.tsx:19-21`, `onboarding/no-access/page.tsx:11` | `status` is `authenticated` only with a staff role. A cookie with a stamped org and no membership is `denied` and goes to `/onboarding/no-access`. | 15.1 bullet 2 says the app opens for any org user. It doesn't say what replaces the `denied`/`no-access` path, which was built on "learners have no membership" (`server-session.ts:80-83`). |
| `apps/admin/src/app/(dashboard)/settings/settings-nav.tsx:29-38` (`managerOnly` group) and `settings/page.tsx:10-11` | One boolean hides the whole Organization group (General, Team, Integrations, Notifications) and picks the redirect target. | 15.1's "every `isManager` branch names its permission" covers the call site. But one group spans four permissions (`org:update`, `team:read`, `integrations:read`, `notification_categories:write`), so no single permission fits the branch as it is written. |
| `apps/admin/src/app/(dashboard)/communities/[communityId]/page.tsx:13`, `spaces/[spaceId]/page.tsx:14` | Landing tab: managers go to spaces/settings, others to moderation/members. | Covered generically as `isManager` branches, but no listed permission picks "spaces vs moderation". It needs a choice between `communities:write` and `community_moderation:read`/`community_members:read` on that community. |
| `hlms-community/src/lib/community.ts:36-51` (`dmRefusal`, `firstMessageIsRequest`) with `src/server/data.ts:48-51` | Uses the viewer's own staff status (`isStaffRole(me.role)`) to pick `staffToAnyone` and to exempt the viewer from message requests. | 15.3 says these read "the server's `team` flags". Section 14 gives `team` to authors, directory rows and community members, but not to the viewer: the community home gets `viewer.permissions` and `viewer.opensEverySpace` only. The viewer's own `team` on the community is missing from the wire. |
| `hlms-community/src/components/shell/frame.tsx:183` (`SidebarAccount`) | The account menu shows `roleLabel(me.role)`: "Staff", "Moderator" or "Member". | `roleLabel` is deleted (15.3). The replacement label isn't named; "Badges and the Team section" doesn't cover the account menu. |
| `hlms-community/src/app/(community)/spaces/[spaceId]/members/page.tsx:54, 71` | `!me.mod && space.locked` hides the roster. `me.mod` shows every status group; others see only active members. | 15.3 maps space members to `community_members:write` only. Seeing the roster and the non-active rows is `community_members:read` (5.1), which 15.3 never names. |

#### 3.1.3 Covered, but cited at the wrong place or described wrongly

| Spec says | Actual |
|---|---|
| Section 7.2: "`resolveScope` (`scope.ts:41`), `resolveScopeFor` (`:68`), `resolveConfiguratorScope` (`:80`)" | Those are the role-check lines. The functions are declared at `packages/server/src/http/scope.ts:22`, `:54` and `:75` |
| Section 8: "`chats.ts` `isStaffRole` (11 places)" for chat moderation | `packages/core/src/discussion/chats.ts` has 14 `isStaffRole` calls on 13 lines. 10 lines are moderation (`:415, 577, 628, 675, 676, 687, 783, 1179, 1196, 1204`) and 3 are team or DM (`:146` ×2, `:974, 977`) |
| Section 8, the before/after at `chats.ts:415`: `if (!isStaffRole(actor.role) && message.senderId !== actor.id) throw …` | The actual code at `chats.ts:415-420` is `if (!isStaffRole(actor.role)) { if (message.orgUserId !== actor.id) throw …; await this.requireWritableChat(…) }`. `Message` has no `senderId` (`packages/core/src/types/schemas/discussion.ts:345-351`, the field is `orgUserId`). Non-staff also pass `requireWritableChat`, which the "after" line drops |
| Section 8: "Member of every community without a grant: `grant-covers.ts:75-81` `STAFF_ROLES`; ids passed into the SQL" | The decision takes effect in five queries that take the row's `org_users.role`: `adapters/db/src/repositories/entitlements.ts:484` (`accessAmong`), `:752` (`communityModeratorIds`), `:771` (`communityMemberIds`), `:814` (`openCommunityIds`), and `adapters/db/src/repositories/member.ts:54` (`directory`). None is named. Three of them need a per-community holder list (`:752, :771`, `member.ts:54`), and `:814` needs a per-person community-id list |
| Section 8, "Shown as team": `members.ts:59,75` | `adapters/db/src/repositories/members.ts:59,75` is the Team *list* filter ("not student", and pending non-student invites). That is section 10.4's query, not badge or DM logic |
| Section 7.6: `AuthorPermissionReader` replaces `AuthorRoleReader` (`container.ts:432-441`) and `AccessFacts.role` | There is a third role source: `DiscussionRepository.authorsOf` (`adapters/db/src/repositories/discussion.ts:286`, through `org-user-profile.ts:31`). `courseOpeners` (`packages/core/src/discussion/service.ts:225-229`) reads it, and so do author views. Section 18 doesn't name it |
| Section 18, `adapters/db`: "repositories take id lists instead of `STAFF_ROLES`, `MODERATING_ROLES` and `STUDENT_ROLE`" | Repositories also *select* `org_users.role` into views, which breaks when the column is dropped: `org-user-profile.ts:31`, `discussion.ts:286`, `member.ts:27`, `admin.ts:726`, `entitlements.ts:483,491`, `members.ts:52,67`. These are covered only by the wire rows of section 14 |
| Section 18, `adapters/email-templates`: `roleAssigned` replaces `youAreNowAModerator` | The template is also registered in core: `packages/core/src/automations/catalog.ts:42` and `packages/core/src/types/email-templates.ts:91`. The derivation is `packages/core/src/automations/community-derivations.ts:538-554` (`orgUser.role !== 'moderator'` at :546), and the in-app rule is `packages/core/src/automations/notifications/rules/organizations.ts:7`. Section 18's automations row covers the rule but no file is named |
| Sections 4.2 and 10.3: the owner is "the org's `ownerId`", compared against the person | `organizations.owner_id` references `users.id` (`adapters/db/src/schema/organizations.ts:16-18`) and is set from the Better Auth user id (`packages/server/src/app/container.ts:826`). `Actor.id` is an org-user id. Today's owner checks don't use it at all: they read the org-user role (`packages/core/src/organizations/service.ts:540, 664, 676`) |

#### 3.1.4 Wire fields section 14 removes or renames, by reader

"Named in section 15?" says whether section 15 names the change for that reader.

| Field | Read at | Named in section 15? |
|---|---|---|
| session `activeMemberRole` | `apps/admin/src/lib/auth/server-session.ts:69, 84-86` | Yes (15.1) |
| `Member.role` / `Role = Member["role"]` | `apps/admin/src/lib/api/types.ts:164` (the admin's whole `Role` type, also used by `SessionUser.role` `:265`); `settings/team/members-columns.tsx:43, 49, 107, 144, 150`; `members-table.tsx:62-63, 144`; `lib/api/server.ts:387` (role query filter), `:394` | Pickers and facets yes. The owner check `:43, 144` and the `Role` type derivation no. |
| `AssignableRole`, `UpdateMemberRole` body | `settings/team/actions.ts:22-24`, `members-table.tsx:75-79`, `members-columns.tsx:41, 50, 82` | Yes ("Set role", 15.1 bullet 5) |
| `InviteRole` / invite `role` | `settings/team/_components/invite-dialog.tsx:31`, `settings/team/actions.ts:13`, `students/actions.ts:25` (`"student"`) | Dialog yes. `students/actions.ts:25` no. |
| `CommunityMember.role` | `(community)/members/_components/community-members-table.tsx:19, 53`; `lib/api/server.ts:434-439` (`communityMembersLite`); `spaces/[spaceId]/members/page.tsx:46` | Badge yes. The candidate filter at `members/page.tsx:46` no. |
| `commentAuthorSchema.role` | admin `courses/[courseId]/discussion/_components/comment-body.tsx:89-91`; student `components/player/discussion/comment-item.tsx:86-91`; community `posts/[postId]/page.tsx:99, 132, 175`, `posts/post-row.tsx:73`, `posts/comments.tsx:26, 214` | Student and community yes. Admin no. |
| `dmSettings.memberToStaff` / `staffToAnyone` | admin `(community)/settings/_components/direct-message-settings.tsx:27, 32`; community `lib/community.ts:44-45` | Community yes. Admin no. |
| `GET /api/access/scopes` (`listAccessScopes`, `{scope, allowed}[]`) | `apps/admin/src/lib/api/server.ts:587`, `settings/api-keys/page.tsx:15`, `(auth)/oauth/consent/page.tsx:48`, `lib/auth/oauth-flow.ts:69-73` | No |
| `MemberViewer.role` | community `src/server/data.ts:50`, `src/lib/types.ts:22` (`Role = Viewer["role"]`), and every `me.role` (`posts/[postId]/page.tsx:92`, `chats/with/[orgUserId]/page.tsx:41, 43`, `chats/new/page.tsx:54`, `chats/new-group/page.tsx:38`, `(community)/members/page.tsx:35`, `people/[orgUserId]/card/route.ts:39`, `shell/frame.tsx:183`). The student app reads only `orgUserId`. | `getMe` yes. The account menu (`frame.tsx:183`) no. |
| `DirectoryEntry.role` | community `(community)/members/page.tsx:31-32`, `chats/new/page.tsx:39`, `people/[orgUserId]/card/route.ts:37`, `spaces/[spaceId]/members/page.tsx:117` | Yes |
| `moderator.assigned` notification type | community `lib/notifications.ts:165, 174, 216` | Yes |
| Route summaries "(staff)", "Staff only", "Owner or admin" | 152 generated pages under `apps/website/content/docs/api/**` (for example `content/deleteCourse.mdx:2-3` "Delete a course (staff)"), produced by `apps/website/scripts/generate-api-docs.mjs` from `packages/sdk/openapi.json` | No. Section 18 names `public/openapi.json` and the SDK, not `gen:api-docs` or `content/docs/api`. |

### 3.2 Routes and tools without a fitting permission or an actor

There are 251 REST routes in `routes/**` (144 staff, 107 member), plus `/health` (`routes.ts:23`), `/api/auth/*` (`plugins/auth.ts:29-35`), `/mcp` (`mcp/route.ts:43,79`) and three `/.well-known/*` routes, and 87 MCP tools in `mcp/tools/**`. `routes/identity.ts` and `routes/progress.ts` are empty stubs and are not registered.

#### 3.2.1 No fitting permission

| Route / tool | Line | Why |
|---|---|---|
| GET /api/notification-types | `routes/organizations.ts:310` | Only `notification_categories:write` exists; there is no `notification_categories:read`, and section 5.2's "every `*:write` implies its `*:read`" has no `:read` to imply. |
| GET /api/notification-channels | `routes/organizations.ts:329` | Same. |
| GET /api/notification-categories | `routes/organizations.ts:346` | Same. |
| GET /api/notification-categories/defaults | `routes/organizations.ts:405` | Same; also serves the community defaults (`:421-422`), which would be `communities:*`. |
| GET /api/communities/:communityId/notification-categories | `routes/communities.ts:165` | Spec section 8 names `communities:write` for a community's categories; a read has only `communities:read` ("see the community in the admin app"), not stated. |
| GET /api/access/apps, GET /api/access/api-keys | `routes/access.ts:41, 79` | `api_keys:write` covers "create and revoke"; there is no `api_keys:read`. |
| GET /api/access/scopes | `routes/access.ts:23` | Removed by spec 14; its replacement `GET /api/access/permissions` is "any org user". The API-key screen loses the per-scope `allowed` flag (`core/organizations/access-scopes.ts:88-90`). |
| POST /api/integrations/:id/actions/:actionId | `routes/integrations.ts:189` | `integrations:write` lists connect, configure, disconnect; invoking an action is not named. |
| GET /api/automations/webhooks/:id/secret | `routes/webhooks.ts:130` | Revealing a signing secret: `automations:read` would hand it to every read holder; no permission is named for it. |
| POST /api/comments/:commentId/replies; MCP `reply_to_comment` | `routes/discussion.ts:110`; `mcp/tools/comments.ts:47` | Replying is a member action that needs the course open (`courses:preview` or a grant); MCP gates it on `comments:moderate`. The spec names no permission for it. |
| GET /api/communities/:communityId/members; MCP `list_community_members` | `routes/community-moderation.ts:39`; `mcp/tools/community-members.ts:13` | It lists the community's grant holders (`reporting.admin.communityMembers`). `community_members:read` is defined as "every space member, with their status"; `access:read` is "see grants". Neither is stated for it. |
| POST /api/organizations | `routes/organizations.ts:46` | Pre-org, any signed-in person; no permission can apply (no actor exists). The spec doesn't mention it. |
| GET /api/organizations/invites/:token, POST /api/organizations/invites/accept | `routes/organizations.ts:234, 268` | Public / invitee; no actor. Spec 13 adds "accepting re-checks the inviter's current permissions", which this route's core call (`acceptInvite(input)`, `core/organizations/ports.ts:48`) has no inviter actor for: it must build one with `actorFor` for the inviter. |
| PUT /api/member/posts/:postId/reactions | `routes/member/posts.ts:394` | Turning reactions on/off is moderation today (`posts.ts:890`); `community_moderation:write` names approve, remove, restore, pin and lock, not reactions. |
| GET /api/member/communities/:communityId/thumbnail | `routes/member/files.ts:87` | Unpublished community thumbnail via `isStaffRole` (`reporting/member/service.ts:403`); spec 8 maps that line to `courses:preview`/`downloads:preview` only. `communities:enter` would fit but isn't named for it. |

#### 3.2.2 One method, two permissions (REST vs MCP)

Section 7.5 declares one permission per method. Today these methods are reached under different scopes:

| Method | REST | MCP |
|---|---|---|
| `content.deleteModule` | `routes/activities.ts:150` → `courses:write` | `delete_module` `mcp/tools/courses.ts:126` → `courses:delete` |
| `content.deleteSpace` | `routes/communities.ts:425` → `communities:write` | `delete_space` `mcp/tools/communities.ts:173` → `communities:delete` |
| `reporting.admin.studentAnalytics` | `routes/students.ts:65` → `students:read` | `get_student_analytics` `mcp/tools/people.ts:150` → `analytics:read` |
| `reporting.admin.courseAnalytics`, `courseEnrollments` | `routes/course-analytics.ts:22, 44` → `course_learners:read` | `get_course_analytics`, `get_course_enrollment_trend` `people.ts:125, 138` → `analytics:read` |
| `reporting.admin.communityAnalytics` | `routes/communities.ts:265` → `community_analytics:read` | `get_community_analytics` `communities.ts:198` → `analytics:read` |
| `chats.messageQueue`, `resolveMessageFlags`, `lock`, `unlock` | `chats:moderate` | `community-moderation.ts:28, 127, 145, 158` → `community_moderation:read/write` |

The last row changes behaviour for existing keys and grants: `chats:moderate` is not one of the 27 scopes (`core/organizations/access-scopes.ts:4-32`), so a token holding `community_moderation:write` today keeps none of the chat tools once their permission becomes `chats:moderate`, and existing tokens can't carry it until reissued.

#### 3.2.3 Staff routes whose core method takes no actor

Each needs an `actor` parameter before it can check. Signatures are in `core/`.

| Routes | Method (file:line) |
|---|---|
| GET /api/courses (`courses.ts:27`) | `listCourses(orgId, query)` `content/service.ts:153` |
| GET /api/courses/:id (`:46`) | `getCourse(orgId, id)` `:157` |
| POST /api/courses (`:68`) | `createCourse(orgId, input)` `:162` |
| PATCH /api/courses/:id (`:88`) | `updateCourse(orgId, id, patch)` `:172` |
| PATCH /api/courses/:id/settings (`:108`) | `patchCourseSettings(orgId, id, value)` `:187` |
| 3 module/activity reads (`activities.ts:30, 49, 67`) | `listCourseModules(orgId, courseId)` `:231`, `listCourseActivityViews` `:237`, `listCourseActivityAssets` `:251` |
| 8 module/activity writes (`activities.ts:86-239`) | `createModule` `:275`, `reorderModules` `:261`, `updateModule` `:290`, `deleteModule` `:318`, `reorderActivities` `:338`, `saveActivity` `:376`, `deleteActivity` `:445` |
| 9 download routes (`downloads.ts:30-218` except DELETE `:111`) | `listDownloads` `:473`, `getDownload` `:477`, `createDownload` `:482`, `updateDownload` `:492`, `listDownloadAssets` `:534`, `addDownloadAsset` `:538`, `removeDownloadAsset` `:555`, `renameDownloadAsset` `:571`, `reorderDownloadAssets` `:590` |
| 8 bundle routes (`bundles.ts:29-166`) | `listBundles` `:624`, `getBundle` `:628`, `createBundle` `:632`, `updateBundle` `:662`, `deleteBundle` `:676`, `listBundleItems` `:693`, `addBundleItem` `:697`, `removeBundleItem` `:709` |
| 4 community reads (`communities.ts:36, 77, 312, 375`) | `listCommunities` `:766`, `getCommunity` `:770`, `listSpaces` `:796`, `getCommunitySpace` `:787` |
| 3 community + 4 org notification-category routes (`communities.ts:165-206`, `organizations.ts:346-405`) | `NotificationCategoryService.get/replace/reset/defaults` `shared/ports.ts:156-168` |
| GET /api/notification-types, -channels (`organizations.ts:310, 329`) | registries, not services: `typesForList` (`shared/notification-categories`), `ChannelRegistry.list()` |
| 3 entitlement routes (`entitlements.ts:25-63`) | `list` `entitlements/ports.ts:93`, `grant` `:94`, `setStatus` `:96` |
| 9 automation + 7 webhook routes | every method `automations/ports.ts:188-208` |
| 8 integration routes | every method `integrations/ports.ts:33-57` |
| 7 asset routes | `requestUpload` (only `uploadedBy` in input), `confirm`, `list`, `get`, `remove`, `libraryFile` `assets/ports.ts:39-51` |
| GET /api/overview, /enrollments; course analytics ×2; community analytics; community members; students list/get/analytics | every method `reporting/admin/ports.ts:17-33` |
| GET /api/organizations/members (`organizations.ts:102`) | `listMembers(orgId, query)` `organizations/ports.ts:64` |
| GET /api/comments (`discussion.ts:28`) | `listComments(orgId, query)` `discussion/ports.ts` (DiscussionService) |
| POST /api/comments/:commentId/replies (`discussion.ts:110`) | `getComment(orgId, commentId)` (takes none; `postComment` does) |
| PATCH /api/organizations (`organizations.ts:74`) | no core method: `orgProvider.updateOrganization(headers, …)` (adapter) |
| 5 access routes (`access.ts:41-123`) | no core method: `container.auth.*` (adapter); `GET /api/access/scopes` calls `scopeOptions(role)` |

Methods that already take an actor today: `deleteCourse`, `removeDownload`, every community/space write (`content/service.ts:808-1222`), `createInvite`, `updateMemberRole`, `removeMember`, `resendStudentInvite`, `deleteOrgUser`, every `posts`, `chats`, `discussion` (except `listComments`, `getComment`) and `entitlements` space-member method. In `deleteCourse` and `removeDownload` the actor is used only for event metadata (`content/service.ts:223, 526`).

Member routes whose core method takes only an `orgUserId`, which matter because spec 6 says `courses:preview` "opens the course, its lessons" and `downloads:preview` "opens the download": `reporting.member.listCourses`, `getCourse`, `listModules`, `listActivities`, `courseProgress`, `listDownloads`, `getDownload` (`reporting/member/ports.ts:24-42`, used by `routes/member/courses.ts:23-87`, `downloads.ts:16-34`, `progress.ts:46`); `progress.report` (`progress/ports.ts:13`, input `orgUserId`); `orgNotificationSettings(orgId, userId)` (`reporting/member/ports.ts:105`, where spec 12.2 wants viewer-filtered categories). Today these are grant-only with no staff bypass (`reporting/member/service.ts:298-308, 380-384`).

#### 3.2.4 Routes that don't call one core method

Section 7.2 says each route calls one core method, which checks.

| Route | Line | What the handler does |
|---|---|---|
| GET /api/access/scopes | `access.ts:23` | Calls the pure function `scopeOptions(scope.role)`; no service. |
| GET/DELETE /api/access/apps, GET/DELETE /api/access/api-keys | `access.ts:41, 59, 79, 123` | Call the Better Auth adapter (`container.auth`) directly; no core method. |
| POST /api/access/api-keys | `access.ts:97` | Runs `assertRoleHoldsScopes(role, scopes)` in the handler (`:111`), then calls the adapter `container.auth.createApiKey` (`:112`). A permission check in the transport. |
| POST /api/organizations | `organizations.ts:46` | Adapter `orgProvider.createOrganization`; core is reached only through the mirror hook. |
| PATCH /api/organizations | `organizations.ts:74` | Adapter `orgProvider.updateOrganization`; the only check is Better Auth's `organization:update`. Spec 9.3 makes Better Auth `member` hold `organization:update`, so after the change nothing checks `org:update` unless a core method is added. |
| GET /api/organizations/invites/:token | `organizations.ts:234` | `organizations.peekInvite` + `identity.getUserByEmail`, shaping the answer in the handler. |
| POST /api/organizations/invites/accept | `organizations.ts:268` | `identity.getUserByExternalId` + `organizations.acceptInvite` + `organizations.getById` + adapter `sessions.stampActiveOrganization`. The comment at `:293-295` (`:294`) says it stamps the session because "Students are never org members, so the org plugin's set-active cannot do it"; spec 9.2 changes that premise. |
| GET /api/notification-types, -channels, -categories/defaults | `organizations.ts:310, 329, 405` | Registries or a shared function, not a service method; the defaults route picks org vs community in the handler (`:419-422`). |
| DELETE/PATCH /api/comments/:commentId, DELETE …/reports | `discussion.ts:46, 65, 88` | `organizations.getOrgUser` in the handler (instead of `resolveScope`'s result) + the discussion method; the role reaches core through the `OrgUser` row. |
| POST /api/comments/:commentId/replies | `discussion.ts:110` | `getOrgUser` + `discussion.getComment` + root-resolution logic (`:129-136`) + `discussion.postComment`. MCP `reply_to_comment` skips the lookup and posts with the given `parentId`. |
| GET /api/integrations, POST, GET/:id, PATCH, reconnect | `integrations.ts:67-180` | One service call, then `toApi` strips `credentialRef` in the handler (`:26-29`). |
| POST /api/uploads | `assets.ts:43` | Runs `resolveScope` twice (preHandler `:36-38` and `:56`); one service call. Other asset routes read `req.orgId` after the preHandler. |
| GET /api/member/viewer | `member/org.ts:35` | No service: returns `{ orgUserId, role }` from `actorOf`'s row. |
| GET /api/member/profile | `member/profile.ts:15` | No `actorOf`; `identity.profileOf(orgId, userId)`. |
| `POST /mcp` | `mcp/route.ts:63-65` | Filters the tool list in the transport by `grant.scopes ∩ roleHoldsScope(scope.role, …)`. |

Member routes and staff routes otherwise call `actorOf`/`resolveScope` (identity resolution, which the spec keeps in the transport) plus exactly one core method.

#### 3.2.5 The spec's new routes against existing paths

- `GET /api/access/permissions/list` and `GET /api/access/permissions` (spec 5.2, 10.1, 14): no existing path; `access.ts` has `/api/access/scopes`, `/apps`, `/api-keys`. `scopes` is removed.
- `/api/organizations/roles…`, `/api/organizations/people/:orgUserId…`, `/api/organizations/ownership`: no collision. They sit next to `/api/organizations/members…` (`organizations.ts:102-155`), which spec 14 replaces, and `DELETE /api/students/:id` (`students.ts:117`), which the spec doesn't mention. `organizationsRoutes` is registered without the `requireOrgSession` hook (`routes.ts:25-28`), so each new route needs its own preHandler.
- `GET /api/content/:contentId/roles`: no collision, but no `/api/content` prefix exists; items live under `/api/courses`, `/api/downloads`, `/api/communities`.
- `GET /api/member/communities/:communityId/message-queue`, `POST /api/member/comments/:commentId/restoration`, `POST /api/member/comments/:commentId/approval`: no collision. `discussion.approve` (`discussion/ports.ts:116`) has no caller in any route or tool today; the staff side uses `discussion.publish` (`discussion.ts:83`, `mcp/tools/comments.ts:32`).
- API keys reach only `/mcp`: `requireOrgSession` uses `auth.verify` → `getSession` (`adapters/auth/src/better-auth.ts:531-532`), and the `apiKey` plugin is configured without `enableSessionForAPIKeys` (`:208`). An API key can't call any REST route today. Spec 7.2 ("session cookie, API key or OAuth token") and test plan 12 ("a REST session, an API key … and the matching MCP tool") assume the key works over REST.

### 3.3 Claims check

Short paths in this table: `scope.ts`, `routes/…` and `mcp/…` are under `packages/server/src/http/`. `roles.ts`, `access-scopes.ts` and `service.ts` (in organizations rows) are under `packages/core/src/organizations/`. `posts.ts`, `chats.ts` and `titles.ts` are under `packages/core/src/discussion/` unless prefixed. `container.ts` is `packages/server/src/app/container.ts`. Better Auth `*.mjs` files are under `node_modules/.pnpm/better-auth@1.7.7_*/node_modules/better-auth/dist/plugins/organization/`.

Counting method: `grep -rnE '\b<name>\b'` over `packages adapters apps plugins` (community: `src`), `*.ts`/`*.tsx` only, excluding `*.test.ts(x)`, `*.spec.ts`, `node_modules`, `.next`, `dist`, `generated`, `vendor`. "Occurrences" = `grep -o` matches (imports, declarations and re-exports included).

| # | Spec section | Claim | Verdict | Correct value or evidence |
|---|---|---|---|---|
| 1 | 1 | `isStaffRole` occurs 39 times, tests excluded | true | 39 occurrences on 38 lines across 11 files (`chats.ts` 15 on 14 lines, `reporting/member/service.ts` 5, `scope.ts` 3, …) |
| 2 | 1 | `canModerate` 29 | true | 29 occurrences on 29 lines (posts.ts 10, discussion/service.ts 6, entitlements/service.ts 4, entitlements/rules.ts 3, …) |
| 3 | 1 | `STUDENT_ROLE` 24 | true | 24 occurrences (organizations/service.ts 13, admin.ts 4, members.ts 4, …) |
| 4 | 1 | literal role comparisons 18 | true | 18 lines with `===`/`!==` against a role literal: 8 in core/server (`organizations/service.ts:540,572,664,676`, `content/service.ts:89`, `community-derivations.ts:546`, `rules/organizations.ts:7`, `scope.ts:80`), 10 in apps. Not counted by that rule: `eq(orgUsers.role, "student")` at `adapters/db/src/repositories/organizations.ts:290`, and the `ne(...STUDENT_ROLE)` SQL at `members.ts:59,75`, `admin.ts` |
| 5 | 1 | `isManager` 57 in the admin app | true | 57 occurrences, 21 of them in `apps/admin/src/lib/roles.ts` |
| 6 | 1 | `STAFF_ROLES` in SQL | true | `adapters/db/src/repositories/grant-covers.ts:2,77` |
| 7 | 1 | 22 role names in the community app | partly | 9 role-name literals on 7 lines (`community.ts:10,28,32`, `members/page.tsx:31,32`, `chats/new/page.tsx:39`, `card/route.ts:37`). 22 is the number of lines that match `isStaffRole\|isModRole\|roleLabel\|STAFF` |
| 8 | 1 | "Staff" carries eight different meanings (section 8) | false | Section 8's table has 14 rows |
| 9 | 1 | The same instructor can call routes through a session that their API key can't reach | true | `scope.ts:41` admits instructors to every staff route. `access-scopes.ts:76-82` plus `roles.ts:74-78` deny instructors the `create_course`, `manage_users`, `manage_org_settings` and every `'assigned'` scope |
| 10 | 1 | A moderator moderates posts but not chats | true | `posts.ts:1015-1017` uses `canModerate`, which includes moderator. `chats.ts:415,577,687,783` use `isStaffRole`, which excludes moderator |
| 11 | 1 | A moderator has their posts held for review | true | `posts.ts:949` `requireReview && !(role && isStaffRole(role))` |
| 12 | 1 | A moderator can be invited to a space but can't ask to join one | true | `entitlements/service.ts:280` (`canModerate`, refuses the request); `:693` (`isStaffRole`, lets the invite through) |
| 13 | 1 | The instructor's "assigned courses" resolve to no access because nothing records an assignment | partly | True for scopes (`roles.ts:75-76` gives `'assigned'`, and every reader compares `=== true`: `access-scopes.ts:81`) and for the admin UI (`apps/admin/src/lib/roles.ts:45-46`, where `scopedCourseIds` is always `[]`). False for sessions: the course routes behind `resolveScope` check nothing, so an instructor's session edits every course (`routes/courses.ts:82,103,124`, `content/service.ts`) |
| 14 | 1, 9.1 | The organizations context already owns roles and authorization (`docs/domain/organizations.md`) | true | `docs/domain/organizations.md:9-10` |
| 15 | 9.1 | `docs/domain/organizations.md` has a "System of record" section; core keeps a mirror | true | `docs/domain/organizations.md:14-16` |
| 16 | 2.15, 9.1 | Better Auth is the system of record for organizations and memberships today | true | `docs/domain/organizations.md:16`; mirror hooks at `container.ts:822-853` |
| 17 | 4.2, 17.3 | The owner is the org's `ownerId` / `organizations.owner_id` | partly | The column exists (`adapters/db/src/schema/organizations.ts:16-18`), but it references `users.id`, not an org user (`0000_baseline.sql:451`). It is set once from the Better Auth creator (`container.ts:826`) and nothing else reads it. Today's ownership checks read `role === 'owner'` (`organizations/service.ts:540,664,676`) |
| 18 | 5.1 | Existing API scope keys number 27 | true | `packages/core/src/organizations/access-scopes.ts:4-32`, 27 entries; all 27 appear in the spec's list |
| 19 | 5.2 | `contentTypeSchema` is at `packages/core/src/types/schemas/content.ts:6` | true | `content.ts:6` `z.enum(['course','download','community'])` |
| 20 | 5.2 | `contentTypeSchema` is "the one list of content types the content context owns" | partly | It sits in `core/types` (wire), not in `core/content`. Other lists exist: `packages/server/src/http/schemas/entitlements.ts:11` `['course','download']`, `adapters/db/src/repositories/grant-covers.ts:5` `GrantedContentType`, `adapters/db/src/schema/content.ts:65,75-78` (`content_items.type` enum and CHECK) |
| 21 | 5.2 | A new `Permission` type is declared in organizations | partly | `packages/core/src/organizations/roles.ts:37-45` already exports a `Permission` type, re-exported at `organizations/index.ts:32`. It is not in the spec's deleted list |
| 22 | 6 | Today's two conflicting rules: `canModerate` in `requestJoin`, `isStaffRole` in `assertHolder` and `assertHolds` | true | `entitlements/service.ts:280` (requestJoin), `:665` (assertHolder), `:693` (assertHolds) |
| 23 | 7.1 | Every reachable core method takes the caller as an explicit `actor`, "as methods do today" | false | Many take no actor today: `listCourses(orgId, query)`, `getCourse`, `createCourse`, `updateCourse`, `patchCourseSettings` (`routes/courses.ts:41,59,82,103,124`). Task 2 has the full list |
| 24 | 7.1 | Example signature `deleteCourse(orgId, id, actor)` | true | `content/service.ts:208` |
| 25 | 7.1, 7.4 | Example signature `PostService.remove(orgId, postId, actor)` | partly | `posts.ts:425-430` is `remove(orgId, postId, actor, communityId?)`. The 4th parameter is used by `loadVisible` |
| 26 | 7.1 | `Actor` today has a `role` and no `orgId` | true | `packages/core/src/shared/actor.ts:3-6` `{ id, role }` |
| 27 | 7.2 | `resolveScope` (`scope.ts:41`) | true | The staff check is at `:41`; the function starts at `:22` |
| 28 | 7.2 | `resolveScopeFor` (`:68`) | true | The check is at `:68`; the function starts at `:54` |
| 29 | 7.2 | `resolveConfiguratorScope` (`:80`) | true | The owner/admin check is at `:80`; the function starts at `:75` |
| 30 | 7.2 | The transport verifies "session cookie, API key or OAuth token" and resolves the org user "as it does today" | partly | Sessions: `packages/server/src/http/scope.ts:22-52`, `routes/member/actor.ts:4-10`. API keys and OAuth tokens are verified only at `/mcp` (`packages/server/src/http/mcp/route.ts:44`); REST accepts sessions only (`packages/server/src/http/plugins/auth.ts:39-80`), and the `apiKey` plugin has no `enableSessionForAPIKeys` (`adapters/auth/src/better-auth.ts:208`) |
| 31 | 7.2 | `community-mail.ts` acts for a person | partly | There are two files. `packages/server/src/app/community-mail.ts:54-57` builds `{ id, role }` for `openSpacesFor`; `packages/core/src/automations/community-mail.ts` is the port |
| 32 | 7.4 | Deleting a course today (`routes/courses.ts:128-148`, `content/service.ts:208`) checks only that the caller is staff | true | The route spans `:128-148`; `deleteCourse` at `:208-225` has no role check. Over MCP, `delete_course` (`mcp/tools/courses.ts:114`) is refused to instructors by `roleHoldsScope` (`mcp/route.ts:64`) |
| 33 | 7.4 | The MCP tool `delete_course` calls the same method | true | `mcp/tools/courses.ts:123` → `container.content.deleteCourse(scope.orgId, courseId, actor(scope))` |
| 34 | 7.6 | `AuthorRoleReader` is at `container.ts:432-441` | true | `container.ts:432-441` `authors.roleOf/rolesOf`. The port is used at `discussion/chats.ts:33,55`, `posts.ts:26,49` |
| 35 | 7.6, 18 | `AccessFacts.role` exists | true | `packages/core/src/entitlements/ports.ts:64`; filled by `adapters/db/src/repositories/entitlements.ts:483,491` |
| 36 | 8 | Back office: `resolveScope`, `resolveScopeFor`, admin `toRole`, MCP challenge | true | `scope.ts:41,68`; `apps/admin/src/lib/auth/server-session.ts:44-52,84`; `mcp/challenge.ts:18` |
| 37 | 8 | `grant-covers.ts:75-81` `STAFF_ROLES` | true | `grant-covers.ts:75-81` `communityMember` |
| 38 | 8 | `reporting/member/service.ts:403,419,440,576` | true | All four are `isStaffRole` |
| 39 | 8 | `content/titles.ts:53-92` maps to `courses:preview`/`downloads:preview` | partly | The lines are right (`:53,57,66,81,92`). `:92` lets staff see a bundle's name without holding the bundle, and no bundle permission covers it |
| 40 | 8 | `discussion/titles.ts:141` | true | `isStaffRole` in `openActivities` |
| 41 | 8 | `discussion/service.ts:189,206,229` | true | `:189`, `:206` `isStaff`; `:229` `isStaffRole(person.role)` |
| 42 | 8 | `courseReach` | true | `packages/core/src/automations/notifications/rules/discussion.ts:47-60` (adds `staffIds` at `:60`) |
| 43 | 8 | `entitlements/rules.ts:14,23` `canModerate` | true | `rules.ts:14` `opensSpace`, `:23` `seesSpace` |
| 44 | 8 | `entitlements/service.ts:280,665,693` | true | See row 22 |
| 45 | 8 | `canModerate` in `posts.ts`, `discussion/service.ts`, `entitlements/service.ts` | partly | Also in `discussion/titles.ts:120` (held/removed comment titles) and `entitlements/rules.ts:14,23` |
| 46 | 8 | `chats.ts` `isStaffRole` (11 places) | false | 14 uses on 13 lines (`:146`×2, `415, 577, 628, 675, 676, 687, 783, 974, 977, 1179, 1196, 1204`), plus the import at `:10`. 10 uses on 10 lines are chat moderation (`415, 577, 628, 675, 676, 687, 783, 1179, 1196, 1204`); 4 uses on 3 lines are the team/DM meaning (`146`×2, `974`, `977`) |
| 47 | 8 | `discussion/service.ts:527,614,671,774,825,866` | true | All are `isStaff` |
| 48 | 8 | `posts.ts:949`, `discussion/service.ts:303` (skip review) | true | Both lines match |
| 49 | 8 | `content/service.ts:88-92` owner or admin | true | `assertConfigurator` |
| 50 | 8 | `resolveConfiguratorScope` owner or admin | true | `scope.ts:80` |
| 51 | 8 | `assertManagesUsers` | true | `organizations/service.ts:653-661` |
| 52 | 8 | Team/DM: `chats.ts:146,974-978` | true | Both locations match |
| 53 | 8 | Team: `members.ts:59,75` | partly | `adapters/db/src/repositories/members.ts:59,75` exist, but they are the admin Settings > Team list (and pending invites), not the community "Team" |
| 54 | 8 | Staff recipients: `staffOrgUserIds`, `staffIds` | true | `organizations/service.ts:520-522`; `server/app/community-mail.ts:69`; `rules/discussion.ts:60,628,784`; `community-derivations.ts:614` |
| 55 | 8 | Moderator recipients: `communityModeratorIds` with `MODERATING_ROLES` | true | `adapters/db/src/repositories/entitlements.ts:49,744-762` |
| 56 | 8 | Deleted list: every named symbol exists | true | All exist (`roles.ts`, `access-scopes.ts:76,84`, `repositories/organizations.ts:229,286`, `apps/admin/src/lib/roles.ts:18,30,35,39`, `apps/admin/src/lib/api/server.ts:391`, `hlms-community/src/lib/community.ts:10,27,28,30`). Missing from the list but role-bound: `ROLES` (`roles.ts:9`), old `Permission` (`roles.ts:37`), `ROLE_LABEL`, `visibleNav` (named only in 15.1), `ACCESS_SCOPES`→role mapping `SCOPE_PERMISSION` (`access-scopes.ts:36`) |
| 57 | 8 | Lint exemption: `adapters/auth/src/access.ts` and `better-auth.ts` name the Better Auth roles | true | `access.ts:15-40`; `better-auth.ts:200` `creatorRole: "owner"`, `:630` `parseRole(role)` |
| 58 | 8 | Before-snippet `chats.ts:415`: `if (!isStaffRole(actor.role) && message.senderId !== actor.id) throw` | partly | Line is right. Real code (`chats.ts:415-420`) uses `message.orgUserId`, not `senderId`, and also calls `requireWritableChat` for non-staff. The after-snippet drops that writable-chat check and uses `chat.communityId`, where the code has `message.communityId` (`:414`) |
| 59 | 9.2 | Today only staff and moderators have a Better Auth membership; learners are org users alone | true | `organizations/service.ts:255-278` (a student invite creates the `org_users` row, with no Better Auth call), `:382-408` (accept, no Better Auth call), `:410-419` (staff accept → `grantMembership`) |
| 60 | 9.2 | The fork is at `organizations/service.ts:255-278, 374-438, 554-637` | true | `:255-278` createInvite student branch; `:374-377` accept fork; `:382-438` both accept paths; `:554-555` demote; `:566-588` `demoteModerator`; `:590-637` `promoteStudent` |
| 61 | 9.2 | The `demote` flag in `removeOrgUser` | true | `service.ts:184-200` reads `memberWrite(...).demote`, set by `asActor(..., true)` at `:579` |
| 62 | 9.2 | `grantMembership` exists | true | `adapters/auth/src/better-auth.ts:624-643` (`auth.api.addMember`, server-side, no headers, `parseRole(role)`) |
| 63 | 9.2 | The mirror's `addOrgUser` forces `active` today | true | `organizations/service.ts:166,169` |
| 64 | 9.2 | Magic link is sign-in only (`disableSignUp: true`); learners sign up with email and password | true | `better-auth.ts:185,193-196` |
| 65 | 9.2 | `beforeCreateSession` stamps the active org for a person with exactly one org, read from org users | true | `container.ts:801-815` (`getOrgUsersForUser`, `orgs.length !== 1`) |
| 66 | 9.2 | The student app relies on the stamped org | true | `apps/student/src/lib/api/server-call.ts:46` |
| 67 | 9.2 | The community app calls `set-active`, which today fails for learners | true | `hlms-community/src/server/session.ts:46`; Better Auth `crud-org.mjs` set-active throws `USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION` for non-members |
| 68 | 9.3 | Better Auth's default `membershipLimit` is 100 and refuses the 101st member | true | `routes/crud-members.mjs:62-66` (`count >= 100` → FORBIDDEN on add-member); `crud-invites.mjs:275-279`. Also `adapter.mjs:198,448`: list-members and get-full-organization default their page size to `membershipLimit`, so `MAX_SAFE_INTEGER` makes those lists unbounded |
| 69 | 9.3 | `access.ts` uses `defaultStatements`; custom `course`, `progress`, `community` statements; nothing checks them | true | `access.ts:4-11`; no `hasPermission` call anywhere in HL or HC |
| 70 | 9.3 | `dynamicAccessControl` is off | true | Not set in `better-auth.ts:197-202` |
| 71 | 9.3 | `ctx.request` is set only when the call arrived over HTTP; core's server calls pass | true | Better Auth `api/to-auth-endpoints.mjs` sets `request` only when the caller passes one; core never passes one (calls at `better-auth.ts:571,583,592,612,629,645,655,679`). Today's hook tests `ctx.request \|\| ctx.headers` (`better-auth.ts:244,251`) |
| 72 | 9.3 | Core's own server calls are `create, update, delete, update-member-role, remove-member` | partly | Core also calls `list-members` (`better-auth.ts:679`, `resolveMemberId`, with actor headers), `set-active` (`:583`) and `add-member` (`:629`) |
| 73 | 9.3 | The named endpoints exist (`set-active`, `list`, `get-active-member`, `list-members`, `get-full-organization`, `update-member-role`, `remove-member`, `invite-member`, `accept-invitation`, `leave`, role endpoints) | true | All are in Better Auth 1.7.7's `createAuthEndpoint("/organization/...")` list. Others not named: `get-active-member-role`, `check-slug`, `get-organization`, `has-permission`, `cancel-invitation`, `reject-invitation`, `get-invitation`, `list-invitations`, `list-user-invitations`, team endpoints |
| 74 | 9.3 | Today's hook refuses `/organization/*` paths | partly | Today it refuses only `leave`, `invite-member` and `accept-invitation`, and refuses them always, not only over HTTP (`better-auth.ts:70-74,247`) |
| 75 | 9.3, 9.2 | `customSession` exposes `activeMemberRole` | true | `better-auth.ts:213-239` (`:233`) |
| 76 | 9.3 | `creatorRole: 'owner'` | true | `better-auth.ts:200` |
| 77 | 9.4 | Better Auth version 1.7.7 | true | `adapters/auth/package.json:22-29` |
| 78 | 9.4 | `dynamicAccessControl` stores roles per org | true | `organizationRole` model, `has-permission.mjs:9-27` |
| 79 | 9.4 | `member.role` stores the role name, so renaming detaches holders | true | `crud-access-control.mjs:547-575` updates only `organizationRole.role`; `member.role` keeps the old name |
| 80 | 9.4 | No role on a content item | true | Better Auth knows only org and team |
| 81 | 9.4 | `hasPermission` needs a session with a membership, and passes only when one role grants every requested permission | true | `organization.mjs:23-50` (`orgSessionMiddleware`, `findMemberByOrgId`); `permission.mjs:2-10` (loops roles, `authorize(all)` per role) |
| 82 | 9.4 | A stored role can't reuse a static role's name | true | `crud-access-control.mjs:637-648` `ROLE_NAME_IS_ALREADY_TAKEN` |
| 83 | 9.4 | Giving a role doesn't check the giver's own permissions | true | `crud-members.mjs` update-member-role checks `member:update` and the creator rule only |
| 84 | 9.4 | The 1.7.7 role cache is process-wide and goes stale | partly | `permission.mjs:12` is a module-level `Map`, set on every `hasPermission`. It is read only when `useMemoryCache: true` (`has-permission.mjs:29`; used at `crud-access-control.mjs:607`) |
| 85 | 9.4 | No hooks on role changes | true | `types.d.mts:323-673` lists hooks for org, member, invitation and team only |
| 86 | 10.4 | Team reads the `invites` table today | true | `adapters/db/src/repositories/members.ts:63-77` |
| 87 | 11 | `assertRoleHoldsScopes` exists | true | `access-scopes.ts:92-97` |
| 88 | 11 | `invite_student` exists | true | `mcp/tools/people.ts:30-46`, hard-coded `role: 'student'` |
| 89 | 11 | The catalogue (`mcp/catalogue.ts`, `apps/website/lib/mcp-catalogue.json`) lists roles today | true | `mcp/catalogue.ts:4,39,130` |
| 90 | 11 | The OAuth consent screen filters scopes | partly | Today the filter is client-side only (`apps/admin/src/lib/auth/oauth-flow.ts:73`); the server narrows at use, at the MCP tool filter (`mcp/route.ts:63-65`) |
| 91 | 12.1 | Events `organization.user.*`, `organization.invite.*`, `organization.student.*` exist at version 1 and carry `role` | true | `packages/core/src/organizations/events.ts:15-39,61-110` |
| 92 | 12.1 | `organization.student.*` means created or deleted | partly | `organization.student.linked` also exists (`events.ts:107-112`). The student events also carry `role` (`publicOrgUser`, `:20`), but the spec keeps them at version 1 while requirement 14 versions every event that carried `role` |
| 93 | 12.1 | `content.course.deleted`, `content.download.deleted`, `content.community.deleted` exist | true | `packages/core/src/content/events.ts:125,197,264` |
| 94 | 12.1 | Stored automation filters can key on `role` | true | `packages/core/src/types/schemas/automations.ts:38` (`filter: jsonRecordSchema`, over event data) |
| 95 | 12.2 | `moderator.assigned` and the `youAreNowAModerator` email exist | true | `automations/notifications/types.ts:344`; `rules/organizations.ts:7,15`; `community-derivations.ts:538-554` |
| 96 | 12.2 | Notification reasons `staff` and `moderator` | true | `types/notifications.ts:16-17`; `types/schemas/notifications.ts:16-17`; `rules/recipients.ts:11` |
| 97 | 12.2 | Org and community `review` categories | true | `notifications/defaults.ts:23-31` (community review includes `message.flagged` with reason `staff`), `:94-97` (org review) |
| 98 | 12.2 | The invite email names the role by key, and the link depends on the role | true | `adapters/email-templates/src/emails/member-invite.tsx:13`; `organizations/service.ts:486-509` |
| 99 | 14 | `roleSchema`, `inviteRoleSchema` are fixed enums | true | `packages/core/src/types/schemas/organizations.ts:4,10`. Server copies not named in section 14: `InviteRole` (`http/schemas/invites.ts:6`), `OrgRole` (`http/schemas/shared.ts:97`) |
| 100 | 14 | `orgUserSchema.role` | true | `types/schemas/organizations.ts:27,32` (`role: roleSchema`); also `addOrgUserInputSchema :82`, `createOrgUserInputSchema :91` |
| 101 | 14 | `MemberViewer.role` at `GET /api/member/viewer` | true | `http/schemas/member.ts:46-49`; `routes/member/org.ts:36,48` |
| 102 | 14 | `commentAuthorSchema.role`, `DirectoryEntry.role`, `CommunityMember.role` | true | `types/schemas/discussion.ts:48,58`; `http/schemas/community.ts:69,77` |
| 103 | 14 | `Member.role`, `MembersQuery.role`, `AssignableRole`, `UpdateMemberRole`, `MemberRoleChange` | true | `http/schemas/members.ts:12-36` |
| 104 | 14 | `dmSettings.memberToStaff`, `staffToAnyone` | true | `types/schemas/content.ts:302-322` |
| 105 | 14 | `GET /api/access/scopes` (`scopeOptions`) | true | `routes/access.ts:24-37` |
| 106 | 14 | Route descriptions name roles ("Staff only (owner, admin, instructor)", "Owner or admin only") | true | e.g. `routes/courses.ts:136`, `routes/access.ts:31`; "Owner or admin only" in `routes/students.ts`, `organizations.ts`, `communities.ts` |
| 107 | 14 | New member routes reach existing core methods | true | `chats.messageQueue` (`chats.ts:686`), `DiscussionService.restore` (`service.ts:652`), `approve` (`service.ts:773`). Staff-side equivalents: `routes/communities.ts:291`, `community-moderation.ts:356` |
| 108 | 15.1 | `lib/roles.ts` has `isManager`, `can.*`, `ROLE_LABEL`, `ROLE_RANK`, `visibleNav` | true | `apps/admin/src/lib/roles.ts:11,18,35,39,64` |
| 109 | 15.1 | `server-session.ts` reads `activeMemberRole`; `requireManager` exists | true | `server-session.ts:69,84,191` |
| 110 | 15.1 | "Make moderator" and "Remove moderator role" | true | `apps/admin/src/app/(dashboard)/students/_components/student-columns.tsx:83`; `settings/team/members-columns.tsx:158` |
| 111 | 15.2 | The student lesson-comment badge reads `author.role` | true | `apps/student/src/components/player/discussion/comment-item.tsx:86-91` |
| 112 | 15.3 | `lib/community.ts` has `STAFF`, `isStaffRole`, `isModRole`, `roleLabel`; `getMe` builds `me.staff`/`me.mod` | true | `hlms-community/src/lib/community.ts:10,27,28,30`; `hlms-community/src/server/data.ts:46-50` |
| 113 | 15.3 | `dmRefusal`, `firstMessageIsRequest` | true | `hlms-community/src/lib/community.ts:36,49` |
| 114 | 15.3 | Notification settings hide categories client-side | true | `hlms-community/src/app/(community)/notifications/settings/page.tsx:40-41`; `hlms-community/src/lib/notification-settings.ts:173` |
| 115 | 15.3 | `lib/notifications.ts` renders `moderator.assigned` | true | `hlms-community/src/lib/notifications.ts:165,174,216` |
| 116 | 15.3, 18 | There is a vendored SDK | true | `hlms-community/vendor/headless-lms-sdk-main.tgz` |
| 117 | 17.2 | `role_assignments.org_user_id` references `org_users`, `on delete cascade` | partly | `org_users` has a composite primary key `(org_id, id)` (`0000_baseline.sql:23`), so the FK must be `(org_id, org_user_id)` → `org_users(org_id, id)`, the same as `entitlements` (`:471`) |
| 118 | 17.2 | "Validation is in core, as the database stores text"; the item's type comes from a port | partly | A content registry already exists: `content_items(org_id, id, type)` with `unique(org_id, id, type)` and a type CHECK (`adapters/db/src/schema/content.ts:57-81`). `(org_id, content_id, content_type)` could reference it in the database |
| 119 | 17.3 | `org_users.role`, `invites.role` exist as text with app-level enums; Better Auth `member.role` is free text | true | `schema/organizations.ts:40-42,72`; `schema/better-auth.ts:95` |
| 120 | 18 | Email templates `community.tsx:282-291`, `index.tsx:42,105-107`, `member-invite.tsx:13,26` | true | All ranges match |
| 121 | 18 | Website files `content/docs/mcp/permissions.mdx`, `architecture.mdx`, `building-a-frontend.mdx`, `components/mcp/scope-matrix.tsx`, `tool-catalogue.tsx`, `catalogue.ts`, `lib/mcp-catalogue.json` | true | All exist under `apps/website/` |
| 122 | 18 | `apps/api/scripts/gen-mcp-docs.ts` regenerates `lib/mcp-catalogue.json` | true | `gen-mcp-docs.ts:7-9` |
| 123 | 18 | `public/openapi.json` | false | No root `public/openapi.json`. Copies are at `apps/website/public/openapi.json` and `packages/sdk/openapi.json` |
| 124 | 18 | `mcp/test-support.ts` `toolContext(role)` | partly | `toolContext(container, role: StaffRole = 'owner')` at `test-support.ts:68` |
| 125 | 18 | 37 test files build actors from role names | unverifiable | 36 test files contain `role: '<role literal>'`; 39 contain that or `toolContext(`, `STAFF_ROLES`, `ROLES`, `: Role`/`as Role` |
| 126 | 18 | Delete `roles.ts`; rewrite `access-scopes.ts` | true | Both exist at `packages/core/src/organizations/` |
| 127 | 18 | The container has options for a deployment's `roles` | true | The options type exists: `BuildContainerOptions` (`container.ts:145`). It has no `roles` field yet |
| 128 | 4.3 | The server configuration holds container options | true | `container.ts:145,279` |
| 129 | 7.2 | Example `this.posts.publishScheduled(orgId, post.id, author)` follows today's shape | false | `publishScheduled(orgId, postId, now: Date)` takes a time, not an actor (`packages/core/src/discussion/posts.ts:310`) |
| 130 | 7.6 | `AuthorRoleReader` is a port in discussion and entitlements | partly | The port exists only in discussion (`packages/core/src/discussion/ports.ts:235-238`). Entitlements gets the role from SQL (`AccessFacts.role`, `adapters/db/src/repositories/entitlements.ts:483,491`). A third role source exists: `DiscussionRepository.authorsOf` (`adapters/db/src/repositories/discussion.ts:286`, via `org-user-profile.ts:31`), read by `courseOpeners` (`packages/core/src/discussion/service.ts:225-229`) |
| 131 | 7.4 | Example `deleteCourse` and `listCourses` | partly | `deleteCourse(orgId, id, actor)` exists (`packages/core/src/content/service.ts:208`), and the actor is used only for event metadata (`:223`). `listCourses` is `listCourses(orgId, query): Promise<Page<CourseView>>` (`:153`); the example drops the query and paging |
| 132 | 12.1 | Deleted events reach organizations through a subscription | partly | The events exist (`packages/core/src/content/events.ts:124,196,263`). No context subscribes to another context's events today; the only subscriber is `subscribeAll` for automations (`packages/server/src/app/container.ts:727`) |
| 133 | 18 | Content gets "a port for organizations that returns a content item's type" | partly | No content method returns an item's type by id. The `content_items(org_id, id, type)` registry holds it (`adapters/db/src/schema/content.ts:55-81`), and the house pattern is a port declared by the consumer and implemented in the container (`container.ts:432`, `:631`) |

### 3.4 Dependencies

| Dependency | Exists as described? | Evidence | Consequence |
|---|---|---|---|
| `contentTypeSchema` at `packages/core/src/types/schemas/content.ts:6` | Yes. `z.enum(['course','download','community'])`. Bundles are not in it. | `packages/core/src/types/schemas/content.ts:6-7`; reused by `contentItemSchema.type` `:84` | `levelSchema = z.union([z.literal('org'), contentTypeSchema])` compiles. Organizations already imports `../types/schemas/index.js` (`organizations/events.ts:1`), which the lint allows (`.eslintrc.cjs:53-56` covers `types/**`). A new type also has to be added to the `content_items` CHECK and enum (`adapters/db/src/schema/content.ts:64, 76-79`), `GrantedContentType` (`adapters/db/src/repositories/grant-covers.ts:5`) and the server's own `ContentType` enum (`packages/server/src/http/schemas/entitlements.ts:11`, which is only course and download). So section 5.4's "nothing else changes" holds for roles only. |
| A shared content id and type | **Yes, and the spec misses it.** A registry table `content_items (org_id, id, type)` holds one row per course, download and community. It is unique on `(org_id, id, type)`, and each concrete table pins its `type` with a generated column and a composite FK, `on delete cascade`. | `adapters/db/src/schema/content.ts:55-81` (registry), `:145-150` courses, `:301-304` downloads, `:383-386` communities; the content repo deletes the registry row on delete (`adapters/db/src/repositories/content.ts:387-395, 841-`) | `role_assignments` can take a composite FK `(org_id, content_id, content_type) → content_items (org_id, id, type)` with `on delete cascade`, the same way `entitlements.contentFk` does (`adapters/db/src/schema/entitlements.ts:45-50`, "Grants die with their content"). With that FK the database enforces section 17.2's "content_id must name an item of the org" and "an item's type never changes", which the spec says only core can check because "the database stores text". The cascade would remove assignments without the event subscription in section 12.1, but it would also remove them without emitting `organization.role.unassigned`, so the spec has to choose one of the two. |
| Deleted events per content type | Yes. `content.course.deleted`, `content.download.deleted` and `content.community.deleted`, all `version: 1`, all appended to the outbox inside the delete's unit of work. | `packages/core/src/content/events.ts:124-126, 196-198, 263-264`; emitted at `content/service.ts:222, 525, 891` | **No context subscribes to another context's events today.** The only subscriber is `eventBus.subscribeAll((event) => automations.handle(event))` (`packages/server/src/app/container.ts:727`). The `EventBus` port supports `subscribe(definition, handler)` (`packages/core/src/shared/ports.ts:66-73`), so organizations would be the first per-type subscriber, wired in the container. `InMemoryEventBus.publish` runs typed handlers one after another, before the `subscribeAll` handlers (`adapters/defaults/src/events/index.ts:10-17`). A throwing organizations handler therefore stops automations for that event, and the relay retries both. Also, the content method is `removeDownload` (`content/service.ts:511`), not `deleteDownload`. |
| `organizations.owner_id` | The column exists, but it **references `users.id`, not an org user**. Its only writer is the org-creation hook. It is never updated, and **no decision reads it**. | `adapters/db/src/schema/organizations.ts:16-18`; written once at `packages/server/src/app/container.ts:826` (`ownerId: baUser.id`); in the public payload of `organization.*` events (`organizations/events.ts:4-13`). Ownership is decided by `org_users.role === 'owner'` (`organizations/service.ts:540-546, 663-668, 676-682`). | `actorFor(orgId, orgUserId)` has to join `org_users.user_id` to `organizations.owner_id` to find the owner, so `assignmentsWithRoles` isn't "the one query" over assignments alone. Transfer (section 10.3) must write a user id. The `organization.updated` event will expose owner changes, which it never has before. |
| `AuthorRoleReader` at `container.ts:432-441` | Yes. `authors.roleOf` and `rolesOf` read `org_users.role` through `organizationsRepo`. The port is at `discussion/ports.ts:235-238`. Its consumers are `posts.ts:49, 330, 480` and `chats.ts:55, 850, 863`. | `packages/server/src/app/container.ts:432-441` | The citation is accurate. Entitlements has no `AuthorRoleReader`. Its role comes from SQL: `AccessFacts.role` is selected in `adapters/db/src/repositories/entitlements.ts:483-491` (`ports.ts:64-69`). So an "`AuthorPermissionReader` in entitlements" replaces a repository column, not a port. |
| `grantMembership` | Yes. The port is `grantMembership(orgExternalId, userExternalId, role: string)`. The adapter calls Better Auth `addMember` server-side with `parseRole(role)`, without headers, and treats "already a member" as success. | `packages/core/src/organizations/ports.ts:199`; `adapters/auth/src/better-auth.ts:624-643`; callers `organizations/service.ts:419` (staff accept), `:622` (promote) | Calling it with `'member'` throws today: `parseRole` accepts only the five domain roles, and `member` isn't one of them. `addMember` fires `beforeAddMember` → `addOrgUser`, which forces `status: 'active'` (`service.ts:163-175`). The spec's "addOrgUser keeps status" change is therefore required for its acceptance order. `addMember` enforces `membershipLimit`, which defaults to 100 (`better-auth/dist/plugins/organization/routes/crud-members.mjs:62-66`). |
| Mirror hooks | Yes: `beforeCreateOrganization` `:822-834` (writes `ownerId`), `beforeUpdateOrganization` `:833-835`, `beforeDeleteOrganization` `:836-838`, `beforeAddMember` `:839-845` (`parseRole(member.role)` → `addOrgUser`), `beforeUpdateMemberRole` `:846-850` (`parseRole(newRole)` → `updateOrgUser`), `beforeRemoveMember` `:851-853` (→ `removeOrgUser`, which carries the `demote` and student branches at `service.ts:177-219`) | `packages/server/src/app/container.ts:822-853` | Once Better Auth roles are `owner` and `member`, `beforeAddMember` and `beforeUpdateMemberRole` throw until they stop calling `parseRole`. The org creator reaches `addOrgUser` with role `owner`, so creation depends on that change too. |
| `beforeCreateSession` | Yes. It stamps `activeOrganizationId` when the person has exactly one org user. It reads **org users of any status**, `invited` included (`getOrgUsersForUser` → `findOrgUsersByUser`, which has no status filter). | `packages/server/src/app/container.ts:802-818`; `adapters/auth/src/better-auth.ts:271-275`; `adapters/db/src/repositories/organizations.ts:200-207` | Today a learner's first session, at sign-up from the invite and before acceptance, gets the org stamped because the invited row already exists. Once the hook reads memberships, that session gets nothing, because the membership is created only on acceptance. The accept route stamps the session itself through `container.sessions.stampActiveOrganization` (`packages/server/src/http/routes/organizations.ts:293-301`), which the spec doesn't mention. Keeping it covers the gap. |
| How content exposes an item's type | **No content service method or port returns the type for an id.** The closest code is `MailerLookups.contentInfo`, a container-wired lookup declared in `core/shared/mailer.ts:14-23`. It tries `getCourse`, then `getDownload`, then `getCommunity` (`container.ts:639-650`). The entitlements repository joins `content_items` directly in SQL (`adapters/db/src/repositories/entitlements.ts:42, 167-170, 249-252, 413-415`). Ids also carry type prefixes: `crs_`, `dwn_`, `cmy_` (`core/shared/id.ts:18, 22, 34`). | as cited | A port is feasible without breaking the boundaries. The house pattern is a port declared by the consumer (organizations) and implemented in the container, like `authors` (`container.ts:432`) and `mailerLookups` (`:631`). Alternatively, `assignmentsWithRoles` can join `content_items` in SQL, as entitlements does. Section 18's wording, "A port **in** content … for organizations", inverts the usual direction. |
| Boundaries for organizations reading content | Today organizations imports only `identity` and `types` (`organizations/ports.ts:22`, `service.ts:38`). `content` imports `organizations` (`content/titles.ts:1`, `isStaffRole`). The lint enforces index-only cross-context imports (`.eslintrc.cjs:13, 82-85`). It doesn't forbid cycles. | `.eslintrc.cjs:1-150` | `organizations → content/index` would form a cycle `content ↔ organizations` while `content/titles.ts:1` still imports `isStaffRole`. The spec deletes that import, so the cycle goes away, and a container-implemented port needs no import at all. Discussion and entitlements calling `organizations.actorFor` or `holders` is consistent with the existing edges `discussion → organizations` and `entitlements → organizations`. |
| `ForbiddenError` in `core/shared` | Yes | `packages/core/src/shared/errors.ts:29` | none |
| `ContentId` type | **No such type exists** | grep: no hits in `packages/core/src` | It has to be added (to `core/shared` or `types`). |
| `Actor` | It is `{ id: string; role: Role }`, with **no `orgId`** | `packages/core/src/shared/actor.ts:1-6` | Section 18 is right that `Actor` "gains `orgId`". Section 7.1 is wrong that methods take the actor "as they do today": most methods don't (Task 5). |
| A repository style for `assignmentsWithRoles` | Yes. `DrizzleOrganizationsRepository` has `findOrgUser…` and `findOrgUserIdsByRole` (`adapters/db/src/repositories/organizations.ts:191-245`), behind the `OrganizationsRepository` port (`organizations/ports.ts`). | as cited | The new methods fit there. `findOrgUserIdsByRole` (`:229-245`) is the model for `holders`. |
| The container `roles` option | **It doesn't exist.** `BuildContainerOptions` holds only `pluginsDir` and `adapters` (`container.ts:145-149`); `Config` (`:151-`) has no roles. | `packages/server/src/app/container.ts:145-170` | New. The spec should say whether it belongs on `Config` (env-driven) or on `BuildContainerOptions`. |
| `nulls not distinct` on `(org_user_id, content_id)` | Supported. Postgres 17 (`docker/docker-compose.yml:16`) has it from 15 on, and drizzle-orm `^0.45.2` exposes `unique().nullsNotDistinct()` (`adapters/db/node_modules/drizzle-orm/pg-core/unique-constraint.d.ts:10`). Nothing in the repo uses it yet. | as cited | Note that `entitlements` relies on the opposite (distinct nulls; `schema/entitlements.ts:61-65`). `org_users` has a composite PK `(org_id, id)` (`schema/organizations.ts:54-56`), so "references `org_users`" must be a composite FK on `(org_id, org_user_id)`, as `entitlements.orgUserFk` is (`schema/entitlements.ts:56-60`). |
| Event versioning | It exists. `defineEvent({ type, version })` with `version: z.literal(version)` (`shared/events.ts:99-121`), and several events are already at `version: 2` (`automations/events.ts:11-31`, `discussion/events.ts:246`). Every `organization.*` event is at version 1 (`organizations/events.ts:42-`). | as cited | Section 12.1's version bump has a mechanism. |
| Better Auth claims (1.7.7) | `membershipLimit` defaults to 100 in `addMember` and accept (`crud-members.mjs:62-66`, `crud-invites.mjs:275-279`). `set-active` requires a membership (`crud-org.mjs:419-425`), so learners are refused today and would pass under the spec. `updateMemberRole` refuses a non-owner changing or setting `owner` (`crud-members.mjs:286-292`), and `removeMember` refuses removing an owner unless the caller is one (`:194-200`). Both still call `hasPermission` on the caller's own Better Auth role (`:202-207, 304-310`). | `node_modules/.pnpm/better-auth@1.7.7…/dist/plugins/organization/routes/*` | The spec's `member` statements (`member: ['create','update','delete']`) pass `hasPermission`. Owner protection stays in Better Auth regardless. `membershipLimit: MAX_SAFE_INTEGER` also becomes the `findMany` limit for users in `findFullOrganization` and `listMembers` (`adapter.mjs:198, 448`), so `get-full-organization` and owner removal load every member. |
| `before` hook "when the call arrived over HTTP" | The hook today blocks `/organization/leave`, `/invite-member` and `/accept-invitation` **on every call, server-side ones included** (`better-auth.ts:70-74, 246-248`). The existing HTTP-only checks use `ctx.request \|\| ctx.headers` (`:243, :249`), and that condition also refuses server calls made with headers. | `adapters/auth/src/better-auth.ts:242-266` | Core's writes (`updateRole` and `removeMember` at `better-auth.ts:644-662`) pass headers, so the spec's test `ctx.request` is the only one that lets them through. The existing `ctx.request \|\| ctx.headers` pattern must not be copied. |

### 3.5 What would break

Each row is something that fails if the spec is implemented exactly as written.

| What | Where | Why the spec's assumption is wrong |
|---|---|---|
| Most person-reachable core methods take no `actor` | Content: 43 of 59 methods, among them `listCourses :153`, `getCourse :157`, `createCourse :162`, `updateCourse :172`, every module, activity, download, download-asset and bundle method, `listCommunities :766`, `getCommunity :770`, `listSpaces :796` (`packages/core/src/content/service.ts`). `reporting/admin/service.ts:27-63`: all 9 take none. `automations/service.ts:537-804`: all 22 take none. `integrations/service.ts:90-214`: 8 of 8. `assets/service.ts:110-295`: 15 of 15. `progress/service.ts:88, 262, 266`. `content/notification-categories.ts` and `organizations/notification-categories.ts`: 4 each. Entitlements: `list :60`, `grant :64`, `setStatus :122`. Organizations: `listMembers :524`. Discussion: `listComments :928` | Section 7.1 says methods take the actor "as methods do today". Only `deleteCourse`, `removeDownload`, the community-configuration methods, the discussion and chat methods and some entitlements and organizations methods do. Each of the rest needs a new parameter and every caller changes. |
| The same method serves people and the system | `content.getCourse`, `getDownload` and `getCommunity` are called by `container.ts:639-650` (mail lookups), `app/community-mail.ts`, `app/notification-reads.ts`, `content/titles.ts`, `progress/service.ts` and 17 sites in `reporting/member/service.ts`. `entitlements.grant` is called by automation actions (`automations/actions.ts:195`) and `ensureGrant` by `app/community-mail.ts:135`. `posts.publishScheduled(orgId, postId, now)` takes `now`, not an actor (`discussion/posts.ts:310`). | Putting `actor.permissions.require` at the top of these methods breaks system callers with no person: automations granting access, mail, notification reads, scheduled jobs. The spec defines no system actor, and no split between internal and person-facing methods. Section 7.5's "every declared method throws for an actor who holds nothing" collides with the same methods' internal use. |
| Lesson comments don't carry their course | `comments` has `activity_id`, `post_id` and `community_id`, and no course id (`adapters/db/src/schema/discussion.ts:227-245`); `listComments(orgId, query)` is org-wide (`discussion/service.ts:928`) | Checking `comments:moderate` or `comments:read` on a course needs activity → module → course per comment, and the admin list needs a course-id filter joined through `activities` and `modules`. Section 18 doesn't list that repository change. |
| Assets aren't attached to a course | `assets` has `source: library \| member` and no course reference (`adapters/db/src/schema/assets.ts:8-30`); `requestUpload(orgId, input)` takes no course (`assets/service.ts:110`) | `courses:write` "upload and read the media attached to it" (section 5.1) has no data to check against. A course-scoped instructor can't upload unless uploads take a course id, or `media:write` is given. |
| Lists can't filter by item ids | `listCourses(orgId, query)` → `repo.listCourses(orgId, query)` returns a `Page` (`content/service.ts:153-156`). Downloads `:473`, communities `:766`, `reporting/admin` course analytics and enrollments, and `listComments` work the same way. | The spec's sample `this.repo.listCourses(orgId, where.content)` drops the query and paging. Every list repository needs an id-list filter, and section 18's adapters/db row lists only the role-list replacements. |
| Repositories select or filter `org_users.role` | `grant-covers.ts:2, 75-81` (`STAFF_ROLES` in SQL), used by `entitlements.ts:483-491` (`AccessFacts.role`), `:744-762` (`MODERATING_ROLES`, `:49`), `:771-776`, `:814-819` and `member.ts:27, 54-59`. `members.ts:24, 52, 59, 67, 75, 85, 101` (team list = not `student`, plus invites). `admin.ts:36, 296, 371, 394` (students = `role = 'student'`), `:726`. `organizations.ts:197-292` (`parseRole` on every read, `findOrgUserIdsByRole`, `findStudentOrgUsers`). `org-user-profile.ts:31` (`authorProfileColumns.role`, used by `discussion.ts:271, 286`). All in `adapters/db/src/repositories/` | Section 18 covers `STAFF_ROLES`, `MODERATING_ROLES` and `STUDENT_ROLE`. It doesn't cover `authorProfileColumns`, which feeds every comment, post and message author view. Replacing it with `team` and `roleName` resolved on the item turns a column select into per-item permission resolution for each batch of authors. `spaceOpenersAmong`, `communityMemberIds` and `openCommunityIds` decide membership for many people in one SQL statement, so core must compute holders of `communities:enter` for each community before calling them. |
| `Actor` is built from org-user rows in about 200 places | `routes/member/actor.ts:4-10` returns the `OrgUser` row itself, which structurally satisfies `Actor`, and every member route passes it on (chats 21, posts 29, community 15, files 12, comments 9, …). `scope.ts:44-50, 72` put `role` into `OrgScope`. `routes/communities.ts` has 15 sites and `community-moderation.ts` 17 that build `{ id, role }`. Also `students.ts:105, 133`, `organizations.ts:143`, `mcp/tool.ts:35`, the MCP tool files (communities 12, community-moderation 12, community-members 6, comments 4) and `app/community-mail.ts:56` | Once `Actor` drops `role` and requires `orgId` and `permissions`, all of these fail to type-check. The member API also accepts `invited` org users (`actorOf` doesn't check status). Under "every invite creates an `invited` org user straight away" (section 13), an invited person with a session can call the member API. |
| API keys and OAuth tokens reach only `/mcp` | `verifyAccess` (API key, OAuth) is called only in `mcp/route.ts:44`. The REST guards accept sessions only (`http/plugins/auth.ts:39-80`). | Test plan item 12 ("an API key with all of the role's permissions" through REST) and section 7.2 ("verifies the credential … API key or OAuth token" for routes) assume REST accepts keys. It doesn't. MCP tools that would write through Better Auth with the caller's headers (removing a person) have no session headers under an API key. |
| Removing a learner leaves a Better Auth membership behind | `deleteOrgUser` deletes the org user in core only (`organizations/service.ts:457-470`); `removeOrgUser`, the `beforeRemoveMember` mirror, leaves `student` rows alone (`:202-204`) | Once every accepted learner has a membership (section 9.2), removal has to go through Better Auth `removeMember`. That fires the mirror, which deletes the row again. The spec doesn't give the order or say which side deletes the org user. |
| The admin app's session state machine assumes learners have no membership | `apps/admin/src/lib/auth/server-session.ts:80-118`: `toRole(activeMemberRole)`, "student logins … no membership row" → `denied`, `organizations.length > 0` → `no-active-org`, `role ?? 'instructor'` (`:135`) | With a membership for every learner, every learner appears in `organizations` (`better-auth.ts:213-238`) and lands on the admin org picker. The rewrite in section 15.1 has to replace this state machine, not just stop reading `activeMemberRole`. |
| Frontends read fields the spec removes | Admin: `lib/roles.ts` (19 reads), `lib/auth/server-session.ts:69-86`, `settings/team/members-columns.tsx:21-25, 43, 144-159`, `members-table.tsx:22-27, 71-72, 128`, `invite-dialog.tsx:24-32`, `courses/[courseId]/discussion/_components/comment-body.tsx:89-91`, `communities/[communityId]/(community)/members/_components/community-members-table.tsx:18-27, 53`, `spaces/[spaceId]/members/page.tsx:8, 46`, `(community)/settings/_components/direct-message-settings.tsx:27, 32` (`memberToStaff`, `staffToAnyone`), `lib/api/server.ts:391-396, 439`, `settings/api-keys/page.tsx:15` and `(auth)/oauth/consent/page.tsx:49` (`listAccessScopes`). Student: `components/player/discussion/comment-item.tsx:86-91`. Community: `src/server/data.ts:46-51` (`viewer.role`), `src/lib/community.ts:10-124`, `src/app/(community)/members/page.tsx:31-45`, `chats/new/page.tsx:39, 54`, `people/[orgUserId]/card/route.ts:37-39`, `components/people/role-badge.tsx` and every `me.staff`/`me.mod` site | Section 15 covers these by area. Two are missing: the admin DM-settings editor (`direct-message-settings.tsx:27, 32`) for the `memberToTeam`/`teamToAnyone` rename, and `lib/api/server.ts:439`. |
| Generated SDK consumers | Functions that change or go: `listAccessScopes` (`apps/admin/src/lib/api/server.ts`, `settings/api-keys/page.tsx`, `oauth/consent/page.tsx`), `updateMemberRole` (`apps/admin/src/app/(dashboard)/settings/team/actions.ts`, `students/actions.ts`), `listMembers` (`settings/team/page.tsx`, `lib/api/server.ts`), `getMemberViewer` (`apps/student/src/lib/api/server.ts`, `hlms-community/src/server/data.ts`), `getMemberCommunityDirectory` (`hlms-community/src/server/data.ts`). The SDK is generated from `packages/sdk/openapi.json` (`package.json:21` `gen:sdk`). The website has its own copy, `apps/website/public/openapi.json`, plus generated pages (`apps/website/content/docs/api/access/listAccessScopes.mdx`, `scripts/generate-api-docs.mjs`). | Section 18 names `public/openapi.json` and the MCP catalogue but not `packages/sdk/openapi.json` or the generated API-reference `.mdx` pages. `hlms-community` takes the SDK from `vendor/headless-lms-sdk-main.tgz` through a pnpm override (`hlms-community/pnpm-workspace.yaml:5-9`), so "copy the SDK" means repacking that tarball. |
| Seeds and load scripts | `hlms-community/scripts/seed.ts:39, 54-65, 368, 388`, `populate.ts:389, 408`, `simulate.ts:306, 328-329` and `load.ts:594, 642` invite with `role: 'student'` and call `updateMemberRole({ role: 'moderator' })`. The headless-lms repo has no seed script. | Nothing in section 18 updates them, and they stop working once `inviteRoleSchema` and `PATCH /members/:id/role` are gone. Test plan item 19 ("end to end on a seeded org") depends on a seed that exists only in `hlms-community`. |
| Event consumers keyed on `role` | `automations/notifications/rules/organizations.ts:7`, `automations/community-derivations.ts:546` (`orgUser.role !== 'moderator'`). The public payloads `publicOrgUser.role` and `publicInvite.role` (`organizations/events.ts:15-38`) are in the automation catalog (`automations/catalog.ts:131-173`). | Covered by section 12, but both consumers read `organization.user.updated`, which section 12.1 says "no longer reports role changes". They must move to `organization.role.assigned`. |
| Email template registry | `types/email-templates.ts:27` (`memberInvite.role` is the raw key), `:91` (`youAreNowAModerator`), `automations/catalog.ts:42`, `adapters/email-templates/src/index.tsx:42, 105-107`, `emails/community.tsx:282-291`, `emails/member-invite.tsx:13, 26` | Section 18 lists only the adapter files. The template id and its parameters are typed in core (`types/email-templates.ts`) and registered in `automations/catalog.ts`, and both must change together. |
| Invite routing by role | `organizations/service.ts:255-267, 374-377, 490-509` (`role === STUDENT_ROLE` decides whether a person is created now, which accept path runs, and which app and template the email uses) | Section 12.2 routes by "the role holds any permission", which needs the resolved role at invite time. With roles stored per org, `sendInviteEmail` needs the org's role set. |
| Dropping `org_users.role` | No index or view references it. `content_access` doesn't (`adapters/db/drizzle/0008_content_access.sql`). It is referenced by the `NoDrift` type check against the `OrgUser` wire schema (`adapters/db/src/schema/organizations.ts:94`) and by the repository sites above. | The schema change is safe in SQL. The type drift check forces the wire change and the schema change to land together. |
| Plugins | `plugins/slack` and `plugins/content-plate` read no roles and no `Actor.role`; the only hits are ARIA `role=` attributes. `adapters/workflow-hatchet` has none. | No breakage. The lint rule in section 8 ("`role` compared with a string literal") must not match JSX `role="button"` (`plugins/content-plate/src/ui/*.tsx`). |
| Ownership checks read the owner role, not `owner_id` | `organizations/service.ts:540-546, 663-668, 676-682`; admin `members-columns.tsx:43, 144-147` (`member.role === 'owner'`) | Once `org_users.role` is gone, owner detection moves to `owner_id`, which is a `users.id` (Dependencies). Wire views need an `isOwner`, or `orgRole.key = 'owner'`, derived from it. |

## 4. Review 3

The readiness review, after the fixes from parts 1 to 3. `spec:N` is a line of the spec at that point.

**Previous reviews.** The fixes are present and correct, with four exceptions:
- Review 1 item 2 and review 2 item 8 (server-only Better Auth writes): the spec names the rule but not a mechanism that exists. It also still relies on mirror hooks that the mechanism doesn't fire (item 2).
- Review 1 item 16 ("the new owner's org-scope row deleted"): dropped from 10.3 (item 4).
- Review 2 item 23 (name the user-to-org-user lookup for the inviter): not in 13 (item 8).
- Review 2 item 29, last point (19.12 can't use a key for item roles): wording unchanged (item 9).

Code check 3.2.4's notification-types, notification-channels, comment-reply and `POST /api/organizations` rows are still open (item 6). Every other code-check row is covered, and the settled points weren't re-examined.

### Wrong

#### Blocking

**1 · fixed · Creating an org leaves it without an owner**
Where: 4.4, 4.5, 9.2, 17.3.
Problem: the owner is the `owner` row in `role_assignments` (4.5, 17.3), and an org user without an org row has Member (4.5). Today the creator becomes owner through Better Auth's creator membership: `/organization/create` runs `beforeAddMember` with role `owner`, and the mirror writes `org_users.role = 'owner'`. Under the spec:
- the mirror hooks stop parsing roles (9.2);
- `org_users.role` is dropped (17.3);
- 4.4 says "Creating an org writes no role rows".

Nothing writes the creator's owner row, so every new org has no owner. The creator resolves as Member and holds nothing. They can't give anyone a role or transfer ownership, and the partial unique index accepts zero owner rows. Writing the row from the hook by reading Better Auth's `member.role` would compare a role string in the server, which requirement 8 and the lint rule refuse.
Evidence: spec:131, :137, :593, :848; `packages/server/src/app/container.ts:822-845`; `packages/core/src/organizations/service.ts:163-175`; `BA/routes/crud-org.mjs:80-100`.
Fix: in 4.4 and 9.2, core's `createOrganization` creates two rows in its transaction: the creator's org user as `active`, and the `owner` assignment (`assigned_by: system`). `beforeCreateOrganization` already calls it with the creator's user id. The `beforeAddMember → addOrgUser` that follows then finds the row and keeps it. Reword 4.4's last sentence to "writes no `org_roles` rows". Add to 19.9: a new org has exactly one owner row, the creator's.

**2 · fixed · Better Auth has no header-less endpoints for these writes, and the adapter path skips the mirror hooks the spec relies on**
Where: 7.4 ("Operations that end in Better Auth"), 9.2, 9.3, 10.2 rule 3, 10.3.
Problem: 9.3 has core update and delete the org, remove a membership and change the `owner` value "through server-only adapter methods that pass no user headers". In 1.7.7, four endpoints need a session: `/organization/update`, `/delete`, `/remove-member` and `/update-member-role`. Each has `requireHeaders: true`, reads the session and checks the caller's own Better Auth role. Only `create` (with `body.userId`) and `addMember` run without a session. The one header-less path for the rest is the organization adapter (`getOrgAdapter(...)`: `updateOrganization`, `deleteOrganization`, `deleteMember`, `updateMember`), and it fires no `organizationHooks`. Three things break:
- 9.2 says removing a person removes the Better Auth membership and "the mirror's `beforeRemoveMember` then deletes the org user". That never happens, so the org user, its grants and its assignments stay.
- 7.4's `updateOrganization(input, actor)` "then calls Better Auth", but the `beforeUpdateOrganization` mirror never runs. That mirror is what writes core's own row and `organization.updated`.
- The `ApiKeys` adapter methods read the caller's session from request headers (`sessionUserId`, `listApiKeys({ headers })`, `deleteApiKey({ headers })`). Rule 3's removal must delete another person's keys, consents and refresh tokens, and 19.12 runs it from MCP, where there are no session headers. The port as described has no method for that.
Evidence: spec:464, :596, :603, :650; `BA/routes/crud-org.mjs:171-208, 239-251`; `BA/routes/crud-members.mjs:139-143, 213-228, 236-240`; `BA/adapter.mjs:295-312` (no hooks); `BA/index.mjs:4` (`getOrgAdapter` is exported); `container.ts:833-838, 846-853`; `adapters/auth/src/better-auth.ts:431-441, 473-490, 523-528`.
Fix:
- In 9.3, name the mechanism. The auth adapter writes through `getOrgAdapter(await auth.$context, …)` for the org update, the org delete, membership removal and the `owner`/`participant` change. It uses `auth.api.createOrganization({ body: { userId } })` and `auth.api.addMember` for the two writes that have server endpoints.
- State that adapter writes fire no mirror hook, so each core method does its own side in the same call. `removePerson` deletes the org user, which cascades its grants and assignments, and emits the deletion event. `updateOrganization` writes core's row and `organization.updated`.
- In 9.2, drop the `beforeUpdateOrganization`, `beforeDeleteOrganization`, `beforeUpdateMemberRole` and `beforeRemoveMember` mirrors. Neither HTTP (refused) nor core (adapter writes) reaches them any more.
- In 7.4 and 10.2 rule 3, every `ApiKeys` method takes the org and user ids, never request headers. Add `revokeAllFor(orgId, userId)` for removal.

**3 · fixed · Content reads that other contexts make for a person have no actor**
Where: 7.1, 7.2, 18 (`content` row and the `discussion, entitlements, …` row).
Problem: 18 has every course, module, activity, download and community method take the actor and check. Other contexts call those same methods while serving a person:
- reporting/member: `getCourse`, `listCourseModules`, `listCourseActivityViews`, `getActivity`, `getDownload`, `listDownloadAssets`, `getCommunity`, `listSpaces`, `getSpace`;
- progress `report`: `getActivity`, `getCourse`, `listCourseModules`;
- discussion: `getActivity` in `resolveConfig` and `hasAccess`, `getSpace` in the post methods, `getDmSettings` in chats;
- entitlements: `getSpace` in `canOpenSpace`, `listSpaces`;
- content's titles.

7.2 lists the system actor's callers: automations, mail lookups, notification reads, grant expiry and the upload sweep. None of the callers above is on it. If they pass the person's actor, `getCourse` requires `courses:read`, so a learner's course page, progress report, comment and space request all answer 403. If they pass nothing, the code doesn't type-check.
Evidence: `packages/core/src/reporting/member/service.ts:138-139, 299, 307, 315, 326, 338, 371, 383, 387, 399-402, 415, 427, 443, 468, 490-494, 514, 579-591`; `progress/service.ts:88-103`; `discussion/service.ts:94-95, 188-201, 250`; `discussion/posts.ts:325, 738, 975`; `discussion/chats.ts:820`; `entitlements/service.ts:164-165, 195, 225, 236, 620`; `content/titles.ts:56-95`; spec:383, :860-861.
Fix: in 7.2, add to the system actor's callers: a context that reads another context's data, inside a method that has already made its own check, passes `systemActor(actor.orgId)`. That covers reporting/member, progress, discussion, entitlements and titles. List those call sites in 18. Add a 19.6 case: a learner with a grant and no permission opens a course, reports progress, comments and requests a place in a space.

**4 · fixed · Transferring ownership to someone with an org role fails on the unique key**
Where: 10.3 step 2; 10.2 rule 4; 17.2.
Problem: step 2 moves the owner row to the new owner. `role_assignments` is unique on `(org_user_id, content_id)` with nulls not distinct, so a person has one org row. Usually the new owner already has one, for example as an Admin. The move then violates the key, after step 1 has already given them `owner` in Better Auth, and repeating the transfer (10.3's recovery) fails the same way. Separately, rule 4 ("Nobody changes their own assignments") refuses step 2 as written, because the actor is the previous owner and step 2 changes their own org row.
Evidence: spec:651, :664, :840.
Fix: in step 2, delete the new owner's org row if there is one, then move the owner row, then write the previous owner's named role. State that rule 4 doesn't apply to `transferOwnership`. Add to 19.9: a transfer to an Admin.

**5 · fixed · No check defines "owner", and an owner's scoped key would pass the obvious one**
Where: 5.1 (closing paragraph), 7.1, 7.2, 10.1 (`transferOwnership`: "owner"), 19.12.
Problem: transfer is owner-only and is not a permission (5.1), so no `has` call can check it. `EffectivePermissions` has nothing that answers "owner". `roleOn()` returns the role whatever the token's scopes, so the only check available is `roleOn().key === 'owner'`. That check passes for an owner's key that carries only `courses:read`, yet 7.2 says such a key "holds only its scopes". 19.12 also requires transfer to work from MCP.
Evidence: spec:218, :322-328, :354, :641, :889.
Fix: add `isOwner(): boolean` to `EffectivePermissions` in 7.1. It is true when the actor holds the `owner` row and, under token scopes, the intersected set is still the whole list. `transferOwnership` requires it, and `isOwner` in `GET /api/access/permissions` reads it. In 19.12, transfer works from MCP with an owner key that carries every permission and is refused with a narrower one.

**6 · fixed · Operations that 7.5 can't map to one core method**
Where: 7.4, 7.5, 10.1, 13.
Problem: 7.5 requires every route and tool to name the one core method it calls, and every public method to be declared a permission, `member` or `system`. These operations don't fit as specified:
- `GET /api/notification-types` and `GET /api/notification-channels` call registries (`typesForList`, the channel registry), not a service. 5.1 gives them `notification_categories:read`, but 7.4 gives the actor only to `get`, `replace`, `reset` and `defaults`, so no method holds the check.
- `GET /api/notification-categories/defaults` picks the org or the community service in the handler. 7.4 gives the community defaults `communities:read` "on a community", but the defaults belong to no community.
- `POST /api/comments/:commentId/replies` loads the parent, resolves its root and then calls `postComment`, a `member` method. `reply_to_comment` calls `postComment` with the parent id it is given. The two answer differently, and neither checks `comments:moderate`, which 5.1 says covers replying.
- `POST /api/organizations` calls the auth adapter. `peekInvite` and `acceptInvite` run with no org user: the caller has no org yet, or is the invitee. None of the three declaration kinds fits a method with no org user.
Evidence: `packages/server/src/http/routes/organizations.ts:60-61, 322-324, 339-340, 418-423`; `routes/discussion.ts:123-138`; `mcp/tools/comments.ts:47-63`; spec:466, :476-479.
Fix:
- In 7.4, add `NotificationCategoryService.types(actor, scope)` and `channels(actor)`. For the org scope they require `notification_categories:read` on the org; for the community scope, `communities:read` anywhere. `defaults(actor, scope)` takes the same rule.
- Add `DiscussionService.replyToComment(commentId, body, actor)`. It resolves the root and requires `comments:moderate` on the comment's course, and both the route and the tool call it.
- Name the core method behind `POST /api/organizations`, which calls the port.
- In 7.5, add a fourth declaration kind, `public`, for methods with no org user: org creation from the route, `peekInvite` and `acceptInvite`.

#### Errors and gaps

**7 · fixed · Accepting a Member invite changes nothing for an existing org user**
Where: 13; 19.8.
Problem: 13 checks rule 2 against an existing org user's current org role, "whatever the role invited", and 19.8 tests that a Member invite to an existing Admin needs that check. Acceptance, though, stores the org assignment only "for a role other than Member", so accepting a Member invite leaves the Admin row as it was. The check guards a change that never happens.
Evidence: spec:730-731, :885.
Fix: acceptance sets the invitee's org role to the invite's role, as `setOrgRole` does, so Member deletes the org row. It emits `organization.role.assigned` when the role changes.

**8 · fixed · The inviter is stored as a user id, but `actorFor` takes an org user id**
Where: 13 (acceptance), 7.2.
Problem: acceptance "builds the inviter's actor with `actorFor`". `invites.invited_by` references `users.id`, while `actorFor(orgId, orgUserId)` takes an org user id. Review 2 item 23 asked for this lookup to be named, and the spec still doesn't name it.
Evidence: `adapters/db/src/schema/organizations.ts:76-78`; spec:345, :731.
Fix: in 13, acceptance finds the inviter's org user by `(org_id, invited_by)`, which `org_users` keeps unique. It fails when there is none or when `actorFor` returns null.

**9 · fixed · 19.12 can't use a key for roles that can't create one**
Where: 19.12.
Problem: 19.12 runs each role "through the matching MCP tool with a key holding all of the role's permissions". Moderator and every role given on an item contribute no `api_keys:write`, so their holders can't create a key (11). They reach MCP only through a connected app. Review 2 item 29 raised this, and the wording is unchanged.
Evidence: spec:169-170, :687, :889.
Fix: change the wording to "with a key or, for a role without `api_keys:write`, a connected app's token, holding all of the role's permissions".

### Verdict

No, the spec is not ready to implement. Items 1 to 6 block it:
- New orgs have no owner (1).
- Better Auth has no header-less endpoints for the writes the spec relies on, and the adapter path skips the mirror hooks the spec counts on (2).
- Every learner-facing read through content would be refused (3).
- Transfer fails for the usual target (4) and has no owner check that respects token scopes (5).
- Several routes have no single core method for 7.5 to name (6).

Items 7 to 9 are small corrections to make in the same pass. Everything else holds: the permission list, levels, assignments, resolution, escalation rules, locks, events, wire changes and app changes are consistent with each other and with the code. Once items 1 to 6 are fixed as written above, the spec can be built without further decisions.

## 5. Review 4

The readiness review after part 4's fixes and the moderation change. It checks every part-4 fix, the moderation merge across the code, and the whole spec for consistency and `file:line` accuracy.

### Previous fixes

Checked against the worktree at `451cdc5a`, `HC/` at `89cf14f`, and Better Auth 1.7.7 (`BA/` = `better-auth/dist/plugins/organization`).

- **4.4, the owner row when an org is created:** holds. `beforeCreateOrganization` calls `createOrganization` before Better Auth inserts the creator's member row (`container.ts:822-832`). Better Auth then runs `beforeAddMember` and `adapter.createMember` (`BA/routes/crud-org.mjs:85-100`), so `addOrgUser` finds the org user and owner row already written.
- **7.1, `isOwner`:** the method itself holds. It conflicts with 19.12 (item 6).
- **7.2, the system actor for internal reads:** holds. 19.6 tests only reporting/member (item 13).
- **7.4, `NotificationCatalog`:** wrong (item 8).
- **7.4, the community defaults:** hold.
- **7.4, `replyToComment`:** holds for the default set. The root lookup it replaces is at `routes/discussion.ts:128-136`. For a role that holds `courses:moderate` without `courses:preview` it fails (D1).
- **7.5, the `public` kind:** holds. There is still no kind for owner-only methods, and `POST /api/organizations` still has no core method (item 10).
- **9.3, the `getOrgAdapter` writes:** the mechanism exists and fires no hooks (`BA/index.mjs` exports `getOrgAdapter`; `BA/adapter.mjs:286-395`). U2's wording is now correct. Two side effects are missing: adding a membership isn't idempotent (item 1), and the org update loses Better Auth's slug check (item 9).
- **9.3, the `ApiKeys` port:** keying on ids works through `ctx.adapter` on the `apikey` and `oauthConsent` models, as `better-auth.ts:445-486` already does for consents. `revoke` drops the owner check (item 4), and `create` drops the key's name (item 12).
- **10.3, transfer:** delete-before-move and the rule-4 exemption are present. Recovery after a failed step 3 can't run, and a transfer to an invited org user fails (item 5).
- **13, acceptance and the inviter lookup:** the lookup works. `org_users` is unique on `(org_id, user_id)` (`schema/organizations.ts:56`), and `invites.invited_by` references `users.id` (`:74-76`). Acceptance sets the role the way `setOrgRole` does. It creates a second membership for an existing org user (item 1).
- **Tests 6, 9, 12, 13:** test 6 is partial (item 13). Test 9's recovery case can't pass (item 5). In test 12, the key-or-app wording is fixed, but transfer contradicts 7.1 (item 6). Test 13 holds. Its "member past 100" case passes trivially, because adapter writes skip the limit.
- **The moderation change** holds in every place I checked:
  - the scope list: 27 scopes, with the four renamed (`access-scopes.ts:4-32`);
  - the 17 tools in `mcp/tools/comments.ts` and `mcp/tools/community-moderation.ts`;
  - the chat checks (`chats.ts:415, 577, 628, 675-676, 687, 783, 1179, 1196, 1204`);
  - the post and comment checks (`posts.ts:402-1016`, `discussion/service.ts:405-866`);
  - skip review (`posts.ts:949`, `discussion/service.ts:303`);
  - entitlements (`rules.ts:14,23`, `service.ts:280, 504, 665, 693, 701`);
  - the recipients (`notifications/rules/discussion.ts:60, 323, 578, 612, 628, 784`, `community-derivations.ts:327-614`);
  - `oauth-flow.ts`, the website's `catalogue.ts`, `HC/src/lib/community.ts` and 15.3.

  No default role loses a permission it needs. No old name is left in the spec. The one slip is section 8's recipients row (item 12), and D1 is the custom-role edge.

### Wrong

#### Blocking

**1 · fixed · Accepting an invite as an existing org user creates a second Better Auth membership**
Fixed in spec 9.2 and 13: `grantMembership` looks the membership up first and creates one only when there is none; test 19.13.
Section 13 lets you invite someone who is already an org user; the role takes effect on acceptance. Acceptance "creates the Better Auth membership", and 9.3 adds memberships through `getOrgAdapter`. Every accepted org user already holds one (9.2).
- `adapter.createMember` is a plain insert with no existence check (`BA/adapter.mjs:286-294`).
- `ba_member` has no unique key on `(organization_id, user_id)` (`adapters/db/src/schema/better-auth.ts:87-97`).
- Today `grantMembership` stays idempotent only because the `addMember` endpoint refuses duplicates and the adapter swallows that error (`better-auth.ts:624-643`, `BA/routes/crud-members.mjs:54`).

So re-inviting an active Member as Instructor leaves two member rows. Removal deletes one of them (`deleteMember` by member id), so the removed person keeps a membership. They can still `set-active`, and their org stays in `memberOrgIds` for OAuth consent. Transfer's `findMemberByOrgId` updates an arbitrary one.
Fix: in 9.3, adding a membership first calls `findMemberByOrgId({ userId, organizationId })` and creates a row only when there is none. Add a test to 19.13: re-inviting an active Member with another role and accepting leaves exactly one membership.

**2 · fixed · An Admin can remove or demote the owner**
Fixed in spec 10.2 rule 5: the owner can't be removed and `setOrgRole` refuses the owner's row; test 19.9.
Rule 3 lets a remover act when they hold every permission the target holds, there or on the org. The default Admin holds "every permission" (4.3, 5.1), so an Admin passes rule 3 against the owner. Rule 2 lets them call `setOrgRole` on the owner for the same reason. No rule refuses either one:
- Rule 5 and 4.2 say what can be done to the Owner *role*.
- The partial unique index (17.2) allows zero owner rows.

Removing the owner cascades their owner row away and leaves the org with no owner. Today this is refused explicitly: "The owner cannot be removed" (`organizations/service.ts:676-682`).
Fix: in 10.2 rule 5, add "The owner can't be removed, and `setOrgRole` and `unassignRole` refuse the owner's org row; only `transferOwnership` changes it (409)." Add both refusals to 19.9.

**3 · fixed · The Team list and invite cancellation have no operation**
Fixed in spec 10.1: `listTeam`, `listStudents`, `createInvite`, `resendInvite` and `cancelInvite`, under `members:read` and `members:write`; tests 19.7.
10.1 says `GET/PATCH/DELETE /api/organizations/members…` "are replaced by these". None of the new rows lists the team.
- Today `GET /api/organizations/members` (`routes/organizations.ts:103-120`, `listMembers`) feeds Settings > Team.
- 10.4 redefines the list, and `team:read` names it ("List the team and pending invites").
- Cancelling an invite is today the invite branch of `DELETE /api/organizations/members/:id` (`service.ts:690-700`).
- 13 defines cancellation ("deletes an org user who is still `invited` and holds no grant") but gives it no route or method.

As written, Settings > Team (10.5) has nothing to read, and pending invites can't be cancelled.
Fix: add to 10.1:
- `GET /api/organizations/people` → `listTeam` (`team:read`), returning 10.4's Team list;
- `DELETE /api/organizations/invites/:inviteId` → `cancelInvite`, which needs `students:invite` for a Member invite and `team:write` with rule 2 otherwise, as 10.4 says for resending.

**4 · fixed · `ApiKeys.revoke(orgId, keyId)` lets anyone delete any key**
Fixed in spec 5.1, 7.4 and 9.3: `api_keys:delete`, and `revoke(orgId, userId, keyId)` deletes only the caller's own key; test 19.12.
9.3 keys the port on ids, and `revoke` takes no user. The core method `deleteApiKey` (7.4) requires `api_keys:write`. Nothing in the spec checks that the key belongs to the caller. Today the adapter refuses another person's key with 404 (`better-auth.ts:523-529`). The permission says "Create and revoke your own API keys" (5.1). As specified, an Instructor revokes the Admin's keys by id. That breaks requirement 12 ("keep working as today").
Fix: in 9.3, use `revoke(orgId, userId, keyId)`, which deletes only a key whose `referenceId` is the user and whose metadata names the org, and is NotFound otherwise. This matches `revokeApp(orgId, userId, clientId)`. `deleteApiKey` passes `actor`'s user id. Add the case to 19.12.

#### Errors and gaps

**5 · fixed · A failed transfer can't be repeated, and a transfer to an invited org user fails at step 1**
Fixed in spec 10.3: both Better Auth writes run before the core transaction, and the new owner must be active; test 19.9.
10.3 runs Better Auth step 1, then the core transaction (step 2), then Better Auth step 3. It says "if step 3 fails, repeating the transfer completes it." After step 2, though, core's owner row belongs to the new owner. The previous owner then fails `isOwner()` and can't repeat. The new owner would be transferring to someone else, so nobody can repeat the same transfer. Nothing in core reads the Better Auth value (9.1), so both Better Auth writes can safely run first. Separately, step 1 needs the new owner's membership, which an `invited` org user doesn't have (9.2).
Fix: in 10.3:
- Order the writes as Better Auth `owner` for the new owner, then Better Auth `participant` for the previous owner, then the core transaction. Both Better Auth writes are idempotent. Until the core transaction commits, the previous owner is still core's owner and can repeat.
- Refuse a new owner who isn't an active org user.

Update 19.9's failure case to match.

**6 · fixed · 19.12 has transfer work from MCP, which 7.1 forbids**
Fixed in spec 10.1 and 19.12: transfer and deleting the org have no MCP tool.
7.1 makes `isOwner()` false "whenever token scopes apply, so an owner's API key or app token can never transfer ownership". `/mcp` only accepts keys and tokens (7.2). 19.9 tests that the owner's key can't transfer. 19.12 ends "Removal and transfer work from MCP", and 10.1 gives MCP "the same operations as tools".
Fix: 19.12 reads "Removal works from MCP; transfer from MCP is refused". 10.1 offers every operation as a tool except `transferOwnership`.

**7 · fixed · People without `api_keys:*` can connect an app but can't list or disconnect it**
Fixed in spec 5.1, 7.4 and 11: connected apps are the person's own, listed and disconnected by any active org user; test 19.12.
11 says connecting an app through consent needs no permission. Every accepted org user now has a membership, so Moderators and Members can consent (`better-auth.ts:110-120` reads Better Auth memberships). 19.12 relies on a Moderator's app token. But listing connected apps needs `api_keys:read`, and revoking one needs `api_keys:write` (5.1). Neither Moderator nor Member holds those (4.3). A Moderator who connected an app can never see or disconnect it. The consents are the person's own records (`better-auth.ts:439-487` filters by user).
Fix: in 5.1, the `api_keys:*` rows cover API keys only. `listConnectedApps` and `revokeConnectedApp` are declared `member` in 7.5 and act on the caller's own consents. Add the case to 19.12.

**8 · fixed · `NotificationCatalog.types` and `.channels` take no scope and refuse community editors**
Fixed in spec 7.4: `NotificationCatalog.types(actor, scope)`, `channels(actor)` and `defaults(actor, scope)`, accepting `communities:read` for the community scope; test 19.15.
- `GET /api/notification-types` filters by `scope=org|community` (`routes/organizations.ts:311-325`, `typesForList(…, req.query.scope)`), but 7.4 gives `types(actor)` no scope.
- 7.4 requires `notification_categories:read`, which is about the org. The community notification settings page loads `notificationTypes("community")` and `notificationChannels()` (`apps/admin/src/app/(dashboard)/communities/[communityId]/(community)/settings/notifications/page.tsx:19-20`).
- A role that holds `communities:write` on one community can edit its categories under 7.4, but can't load the editor.
- 7.4 already lets the community defaults pass with `communities:read` anywhere. `GET /api/notification-categories/defaults` also picks one of two services in the handler (`:418-423`), so it maps to no single operation (7.5).

Fix: in 7.4:
- `NotificationCatalog.types(actor, scope)`, `channels(actor)` and `defaults(actor, scope)`.
- For the org scope they require `notification_categories:read`. For the community scope, and for `channels`, they also accept `communities:read` anywhere.
- The defaults route calls `NotificationCatalog.defaults`.

**9 · fixed · The org update through the adapter loses the slug check**
Fixed in spec 7.4: `updateOrganization` refuses a taken slug with 409 before writing; test 19.13.
`/organization/update` refuses a slug another org holds (`BA/routes/crud-org.mjs:213-216`), and the route turns that into 409 (`better-auth.ts:602-608`, "409 when the slug is taken" at `routes/organizations.ts:81`). `adapter.updateOrganization` writes without that check (`BA/adapter.mjs:352-369`). Core's `updateOrganization` writes the slug with no check either (`service.ts:128-145`, `repositories/organizations.ts:66-73`). Both tables are unique on slug (`schema/organizations.ts:15`, `schema/better-auth.ts:80`), so a taken slug becomes a raw unique-violation 500.
Fix: in 9.3 or 7.4, `updateOrganization` checks `getBySlug` and throws `OrganizationRuleError` (409) before writing either row. Add the case to 19.13.

**10 · fixed · 7.5 can't declare owner-only or either-of methods, and `POST /api/organizations` names no core method**
Fixed in spec 7.5: declarations name one or more permissions, the `owner` kind, and `POST /api/organizations` names `createOrganization`.
- Owner-only methods (`transferOwnership`, deleting the org) aren't permissions (5.1), and they aren't `member`, `system` or `public`. 7.5 has no kind for them.
- Some methods pass with either of two permissions:
  - `createInvite`: `students:invite` or `team:write` (13);
  - resending an invite: the same two (10.4);
  - `removePerson`: `students:delete` or `team:write` (rule 3);
  - `requestUpload`: `media:write` or the item's write permission (7.4).

  `permissionFor` returns one permission, so the OpenAPI text names the wrong one for half the callers. The MCP listing also hides the tool from holders of the other permission (7.5: "MCP lists the tools whose permission the caller holds anywhere").
- `POST /api/organizations` still calls `orgProvider.createOrganization` (`routes/organizations.ts:61`, kept by 9.3), so the route has no core method for its `operation`. Review 3 item 6 asked for one, and the server test in 7.5 fails on it.

Fix: in 7.5:
- Add an `owner` kind, checked with `isOwner()`.
- Let a declaration name several permissions, any of which passes the listing and the descriptions.
- Map `POST /api/organizations` to `organizations.createOrganization` (`public`), which the route reaches through the `beforeCreateOrganization` hook.

**11 · fixed · Deleting the org is owner-only but has no operation**
Fixed in spec 7.4 and 10.1: `DELETE /api/organizations` calls `deleteOrganization`, `owner`.
5.1 and 7.1 name deleting the org as an owner-only action that checks `isOwner()`, and 9.3 adds an adapter write for it. No route or tool deletes an org. The only callers are the adapter and the mirror hook (`better-auth.ts:611`, `container.ts:836-838`). Today the owner can reach it through Better Auth's `/organization/delete`, and 9.3 now refuses that path over HTTP. As written, the check has no method, and today's capability is gone.
Fix: add `DELETE /api/organizations` → `OrganizationService.deleteOrganization(actor)` (`owner` kind, item 10) to 10.1. It deletes through the adapter and writes core's side.

**12 · fixed · Small inaccuracies**
Fixed in spec 16 (`entitlements`), 8 (join requests in the recipients row), 15.1 (the two moderation pages) and 9.3 (`create` takes a name).
- 16 step 9 reads `content_access`, but no such table exists. Grants are in `entitlements` (`adapters/db/src/schema/entitlements.ts`).
- Section 8's "Moderator recipients" row maps `communityModeratorIds` only to `holders(…, 'communities:moderate', …)`. That audience also serves join requests (`community-derivations.ts:353`, `notifications/rules/entitlements.ts:132`), which 12.2 sends to `community_members:write`. Name both in the row.
- 15.1 names a "Moderation" page, but the admin app has none. Moderation is on `courses/[courseId]/discussion` and `communities/[communityId]/(community)/moderation`.
- 9.3 `ApiKeys.create(orgId, userId, scopes)` drops the key's name, which creation takes today (`better-auth.ts:503-511`). Use `create(orgId, userId, name, scopes)`.

**13 · fixed · The test plan misses rules**
Fixed in spec 19.5, 19.6, 19.7, 19.9, 19.12, 19.13 and 19.15.
These have no test in 19:
- Internal reads outside reporting/member. Review 3 asked for these, but 19.6 has only reporting/member. Add a learner with a grant reporting progress, posting a lesson comment and requesting a place in a space.
- Rule 10: a rename to an existing name, in any case, is refused.
- 10.4's lists: James, with only an item role, is in Team with Member as his org role. A Member is in Students.
- 13: cancelling an invite deletes an `invited` org user who holds no grant, and keeps one who holds a grant.
- 12.2: the server sends a viewer only the notification categories that apply to them.
- The cases in items 1 to 11.

### Open for a decision

**D1 · decided · Can `courses:moderate` moderate a course its holder can't open?**
Decided: (a). `courses:moderate` implies `courses:read`, which now opens the course (spec 5.1, 5.2).
5.1 says `courses:moderate` lets the holder approve, remove, restore and reply to lesson comments. The discussion methods it reaches first check that the actor can open the activity, which will mean a grant or `courses:preview`:
- removing (`discussion/service.ts:611`);
- replying, through `postOnActivity` → `requireActivityOpen` (`:196-210`, `:278`);
- reporting (`:723`).

Approving and the admin list don't check (`:773`, `:928`). A role holding `courses:moderate` without `courses:preview` can therefore approve a held comment but not remove one or reply. That is the "Teaching assistant" in section 20, and any role an org adds through the API. The default set is unaffected, because Instructor and Admin hold `courses:preview`. Communities settled the same question: moderating needs membership (6).
Options:
- (a) `courses:moderate` implies `courses:preview` (5.2), as `courses:write` does.
- (b) The lesson-comment moderation methods, including `replyToComment`, skip the open check.
- (c) State that moderating a course needs it open, as communities do, and make `approve` and the admin list check it too.

Recommendation: (a). Lesson comments are moderated from the admin app, where moderators hold no grant. It matches `courses:write`, and it changes nothing for the default set.

### Verdict

No, not as written. Items 1 to 4 block it:
- Re-invites duplicate Better Auth memberships, which breaks removal (1).
- An Admin can strip the org of its owner (2).
- The Team list and invite cancellation have no operation (3).
- Any key holder can revoke anyone's key (4).

Items 5 to 13 are corrections in the same sections. Each has a fix above that needs no decision, except D1.

Everything else holds: the permission list, levels, resolution, escalation rules, locks, events, wire changes, apps, the Better Auth adapter mechanism and the moderation merge. They are consistent with each other and with the code, and the `file:line` references in the spec check out. Once 1 to 13 are fixed and D1 is decided, the spec can be implemented.

## 6. Review 5

The final readiness review, after the naming rules and part 5's fixes.

### Previous fixes

Checked against the worktree at `451cdc5a`, `HC/` at `89cf14f`, and Better Auth 1.7.7 (`BA/`). `spec:N` is a line of `docs/roles-spec.md` as it stands.

- **1, membership idempotency (9.2, 13):** holds. `findMemberByOrgId({ userId, organizationId })` exists (`BA/adapter.mjs:241-264`), `createMember` is a plain insert (`:286-294`), and `ba_member` has no unique key (`adapters/db/src/schema/better-auth.ts:87-97`).
- **2, the owner can't be removed (10.2 rule 5):** holds for `removePerson` and `setOrgRole`. An invite to the owner, or with `owner`, gets around it (item 10).
- **3, people and invite operations (10.1):** present, with four faults. The Team and Students rows share one route and duplicate today's Students list (item 4). Invited staff land in Students (item 5). Cancelling skips rule 2 (item 6). Resend and cancel are keyed on an id the lists don't carry (item 12).
- **4, the `ApiKeys` port and `api_keys:delete` (5.1, 7.4, 9.3):** holds. `apikey.reference_id` exists (`schema/better-auth.ts:306`), and `better-auth.ts:523-529` is today's owner check. Better Auth's own `/api-key/*` endpoints still get around the new permissions (item 9).
- **5, transfer order (10.3):** holds. Both Better Auth writes are `updateMember(memberId, role)` (`BA/adapter.mjs:295-304`), so repeating them is harmless.
- **6, no MCP tool for transfer or deleting the org (10.1):** holds.
- **7, connected apps are the person's own (5.1, 7.4, 11):** holds. `better-auth.ts:439-487` already filters by user.
- **8, `NotificationCatalog` (7.4):** holds. The defaults come from the shared type registry (`shared/notification-categories.ts:20`; `content/notification-categories.ts:85-86`; `organizations/notification-categories.ts:76-77`), so organizations doesn't need to import content.
- **9, the slug check (7.4):** holds. `getBySlug` is at `organizations/service.ts:516`.
- **10, declaration kinds (7.5):** holds. The permission list on `requestUpload` is missing `communities:write` (item 1).
- **11, `deleteOrganization` (7.4, 10.1):** present, but it can never succeed (item 2).
- **12, small fixes (8, 9.3, 15.1, 16):** hold. Both admin pages exist (`apps/admin/src/app/(dashboard)/courses/[courseId]/discussion`, `communities/[communityId]/(community)/moderation`).
- **13, tests (19):** present. 19.1 can't pass (item 8), and 19.7's learner list has no method behind it (item 3).
- **D1, `courses:moderate` implies `courses:read`:** holds (5.2, 19.3).
- **Naming rules (5.1):** five problems:
  - `org:write` breaks rules 2, 3 and 6 (item 7).
  - `communities:moderate` breaks rule 5's definition of `moderate` (item 11).
  - 19.1 tests the rule wrongly (item 8).
  - The community roster lands on two permissions (item 13).
  - `members` is a role's name (D1).

  Every other key in the spec is in the table and is used with the meaning the table gives it: code blocks, 4.3, 6 to 20, the worked example, the tests and the decisions. Old names appear only in 5.1's rename line and as alternatives in 20. Folding preview and enter into `read` widens nothing for a default role or an existing scope. Keys reach only `/mcp`, and no MCP tool opens content. The move of `delete_module` and `delete_space` to `:write` is stated in 11. The section 8 and 9 `file:line` claims I checked all match the code.

### Wrong

#### Blocking

**1 · fixed · Course-scoped people can't finish an upload or re-save a lesson**
Fixed in spec 5.1 (`communities:write` uploads), 7.4 (confirm, reads and added-ids-only saves), 7.5, 16 step 5 and 19.7.
Where: 5.1 (`courses:write`, `communities:write`), 7.4 "Media", 7.5, 16 step 5.
Problem:
- 7.4 gives the item's write permission to `requestUpload` only. An upload then needs `confirm` (`POST /api/assets/:id/confirm`, `assets/service.ts:166-176`) before it is ready. The spec gives `confirm`, `getAsset` and the file redirects (`routes/assets.ts:66-170`) no rule. Under deny-by-default (7.5) they need `media:*`, which no Instructor holds. So James's upload never becomes ready, and step 5 of the worked example fails.
- `saveActivity` checks every asset id in the body (`content/service.ts:383`, `assertLibraryAssets` at `:357-374`), and the body replaces the whole list (`adapters/db/src/repositories/content.ts:488-502, 660-661`). Under 7.4, James can't re-save any lesson that already holds a file not uploaded for `crs_1`. That includes every asset that exists today, since `assets.content_id` starts null and nothing is migrated (17.3), and any file an Admin attached. This affects every Instructor, because the default Instructor holds no `media:read`.
- Community thumbnails are library assets too (`content/service.ts:840`). The `communities:write` row lacks the "upload media for it" clause that `courses:write` and `downloads:write` carry, and 7.5's `requestUpload` list leaves out `communities:write`.

Fix: in 7.4:
- `confirm`, `getAsset` and the file redirects accept the write permission on the item recorded on the asset, as `requestUpload` does.
- Saving an activity, a thumbnail or a download file checks only the asset ids it adds. Ids already attached to that item pass.
- Add "upload media for it and attach media uploaded for it" to `communities:write` in 5.1.
- Add `communities:write` to `requestUpload`'s declaration in 7.5.
- Name `confirm` in 16 step 5. Add a case to 19.7: James re-saves a lesson that holds an Admin's library file.

**2 · fixed · `deleteOrganization` can never succeed**
Fixed: deleting an org stays as it works today; `deleteOrganization` and its route are removed (5.1, 7.1, 7.4, 7.5, 9.3, 10.1, 19).
Where: 5.1, 7.4, 7.5, 10.1, 19.9.
Problem: `org_users.org_id` and every content, discussion, entitlement, progress and asset table reference `organizations.id` with `ON DELETE no action` (`adapters/db/drizzle/0000_baseline.sql:449, 457`; `schema/organizations.ts:29-31`; `schema/content.ts:62`, and so on). Every org has at least the owner's org user (4.4), so core's delete (`repositories/organizations.ts:75-82`) always fails on a foreign key. If the adapter delete (`BA/adapter.mjs:370-395`) runs first, Better Auth's org and memberships are gone while core's org stays. Today the same delete fails inside `beforeDeleteOrganization` (`container.ts:836-838`), before Better Auth writes anything. So "the owner deletes the org" (19.9) can't pass, and the operation as specified leaves the two stores out of step.
Fix: deleting an org is outside roles, so it stays as it works today. Remove `DELETE /api/organizations` and `deleteOrganization` from 7.4, 7.5, 10.1 and 18, and the case from 19.9. Keep `/organization/delete` refused over HTTP (9.3). 5.1 keeps "deleting the org" as owner-only.

#### Errors and gaps

**3 · fixed · `progress:read` promises a learner list that no method serves**
Fixed in spec 7.4 and 15.1: `EntitlementService.list` for a course passes with `progress:read` on it; test 19.7.
Where: 4.3 (Instructor: "see a course's learners"), 5.1 (`progress:read`), 19.7.
Problem: today the only per-course list of learners is the course Access page. It reads `GET /api/entitlements?contentId=` (`apps/admin/src/app/(dashboard)/courses/[courseId]/access/page.tsx:15`; `lib/api/server.ts:360-366`; `routes/entitlements.ts:24-39`), which falls under `access:read` (5.1). `courseAnalytics` holds counts only (`reporting/admin/model.ts:47-54`), and `listStudents` has no course filter (`http/schemas/students.ts:41`). Today an Instructor, as staff, sees this list. Under the default set, no Instructor can, and 19.7's "`progress:read` on a course lists that course's learners" has no method to call.
Fix: in 7.4, `EntitlementService.list` with a `contentId` that is a course passes with `progress:read` on that course. Without one, it needs `access:read`. The declaration names both, and 15.1 gates the course Access page on either.

**4 · fixed · One route serves two methods, and Students duplicates today's list**
Fixed in spec 10.1: Team is `GET /api/organizations/people`; Students stays `GET /api/students` in reporting/admin under `people:read`.
Where: 10.1 (the `list=team` and `list=students` rows), 7.5, 8 (the "Team and Students lists" row).
Problem:
- `GET /api/organizations/members?list=team|students` maps to `listTeam` or `listStudents`. The handler would have to pick the method, which breaks 7.5's one `operation` per route and "routes carry no logic". Review 4 item 8 refused the same pattern for the notification defaults.
- The Students page reads `GET /api/students` → `reporting.admin.listStudents` (`routes/students.ts:24-39`; `apps/admin/src/app/(dashboard)/students/page.tsx:21`). 8 points that list's queries (`admin.ts:296, 371, 394`) at 10.4. 10.1 creates a second `listStudents` in organizations and doesn't say what happens to `GET /api/students`, `/:id` or `/:id/analytics`.

Fix: Team is `GET /api/organizations/members` → `organizations.listTeam` (`members:read`). Students stays `GET /api/students` → `reporting.admin.listStudents` (`members:read`), with 10.4's definition applied to `admin.ts`. Delete the `list=students` row. Name `getStudent` and `studentAnalytics` under `members:read`.

**5 · fixed · Invited staff appear in Students, not Team**
Fixed in spec 10.4: invited org users are listed by their pending invite's role; test 19.7.
Where: 10.4, 13, 4.5.
Problem: an invite stores only the role key, and acceptance writes the org row (13). Member is never stored (4.5). So an invited Instructor is an `invited` org user whose org role resolves to Member until they accept. 10.4 puts "active and invited org users whose org role is Member" in Students, and builds Team from org users' roles, "no longer the `invites` table". Every pending staff invite therefore shows as a student. That contradicts 10.4's own "a role change on an `invited` org user updates the role their invite carries".
Fix: in 10.4, an `invited` org user is listed by the role key on their pending invite. Team and Students join `invites` for invited rows. Add the case to 19.7.

**6 · fixed · Cancelling an invite removes item roles without rule 2**
Fixed in spec 13: cancelling keeps an org user who holds a grant or an item role; test 19.7.
Where: 13 ("deletes an org user who is still `invited` and holds no grant"), 10.2 rule 2, 17.2.
Problem: item roles can be given to an invited org user ("after the person exists", 13). Their assignments cascade with the org user (17.2). `cancelInvite` needs only `members:write` and rule 2 "for the role it carries" (10.4), which is the org role. A holder of `members:write` without `courses:write` can't `unassignRole` James's Instructor on `crs_1`, but can delete it by cancelling his invite.
Fix: in 13, cancelling also applies rule 2 to every item role the invited org user holds, or keeps an org user who holds any assignment, as it keeps one with a grant. Add the case to 19.8.

**7 · fixed · `org:write` breaks rules 2, 3 and 6**
Fixed in spec 5.1: `organizations:read` and `organizations:write`.
Where: 5.1 (`org:write`), 5.2, 19.1.
Problem:
- The resource `org` is singular (rule 2) and is the level `org` itself (rule 3).
- `org:read` doesn't exist, so rule 6 ("each `write` … implies the resource's `read`") has nothing to imply. As 5.2 states the implication, `implies: ['org:read']` doesn't compile against `readonly Permission[]`, and 19.1's "every implication names an existing permission" fails.

Fix: rename the key to `organizations:write` (the API noun, `/api/organizations`), and add `organizations:read`: "See the org's name, slug and general settings", about `org`, held by Admin, implied by `organizations:write`. 15.1's General panel gates on it. Update the uses in 7.4 (`updateOrganization`), 10.1 and 19.6.

**8 · fixed · Test 19.1 fails on every content permission**
Fixed in spec 19.1.
Where: 19.1 ("no resource starts with a content type's name").
Problem: `courses`, `downloads` and `communities` start with `course`, `download` and `community`. Rule 3 forbids a level used as a prefix (`course_`), not the plural resource.
Fix: "no resource is a level followed by `_`, such as `course_learners`".

**9 · fixed · Better Auth's own API-key endpoints get around `api_keys:read` and `api_keys:delete`**
Fixed in spec 9.3: `/api-key/get|list|update|delete` refused over HTTP; test 19.13.
Where: 9.3 (the `before` hook), 5.1, 7.4.
Problem: `/api/auth/*` is served straight to Better Auth (`http/plugins/auth.ts:31`). The hook refuses only `/api-key/create` and metadata updates (`better-auth.ts:243-257`). `/api-key/list`, `/api-key/get`, `/api-key/update` and `/api-key/delete` (`@better-auth/api-key/dist/index.mjs:887, 957, 1122, 1354`) stay open to any session for its own keys. Someone without `api_keys:read` or `api_keys:delete` can still list and revoke keys over HTTP, so the check isn't only in core (requirement 8).
Fix: in 9.3, the hook also refuses `/api-key/get`, `/api-key/list`, `/api-key/update` and `/api-key/delete` when `ctx.request` is set. Add them to 19.13's refused paths.

**10 · fixed · Invites can target the owner or carry `owner`**
Fixed in spec 13: invites with `owner` or to the owner are refused, and acceptance refuses the owner's row; test 19.9.
Where: 13, 10.2 rule 5, 4.2.
Problem: today `createInvite` refuses an owner invite (`organizations/service.ts:250`, `assertNotOwner`). 13 doesn't. An Admin holds every permission, so they pass rule 2 against the owner's org row. They can therefore invite the owner's email as Member, or anyone as `owner`. Acceptance "sets the invited org role the way `setOrgRole` does". Member deletes the owner's row, and `owner` gives ownership outside transfer. Rule 5's refusal names only `setOrgRole` and removal.
Fix: in 13, `createInvite` refuses an invite with `owner` and an invite to the current owner (409), as today. Acceptance refuses the owner's row as `setOrgRole` does. Add both to 19.9.

**11 · fixed · `communities:moderate` holds space membership, which rule 5's `moderate` doesn't cover**
Fixed in spec 5.1 rule 5: `moderate` covers who takes part.
Where: 5.1 rule 5 and the `communities:moderate` row, rule 4.
Problem: rule 5 defines `moderate` as acting "on what other people post in a content item: approving, removing, restoring, pinning, locking and reports". The `communities:moderate` row also covers opening every space, seeing every space member and locked rosters, and inviting, adding, approving, declining and removing space members. Those are about who takes part, not what was posted. Read literally, rule 4 puts space members under `communities` and rule 5 leaves them only `read` and `write`. That would move them to `communities:write`, which Moderator doesn't hold.
Fix: keep the decided fold, and widen rule 5's `moderate` to the fold: "acts on what other people post in a content item and on who takes part in it: approving, removing, restoring, pinning, locking, reports, space members and join requests."

**12 · fixed · Resend and cancel are keyed on an id the lists don't carry, and resend keeps a stale inviter**
Fixed in spec 10.1 and 13: resend and cancel keyed on the org user; resending sets `invited_by`; test 19.8.
Where: 10.1 (`/invites/:inviteId/resend`, `/invites/:inviteId`), 13 (acceptance re-check).
Problem:
- Students and Team rows are org users. Today resend is keyed on the org user, "because the admin app knows the student, not the invitation" (`routes/students.ts:86-114`), and `resend_student_invite` takes an org user id (`mcp/tools/people.ts:49-60`). 10.4 gives the rows no invite id.
- Acceptance fails when the inviter no longer holds what the invite needs (13), and 19.8 tests it. Resending doesn't change `invited_by` (`repositories/organizations.ts:177-189` sets only the token and expiry). So an invite whose inviter left can't be accepted even after an Admin resends it.

Fix: in 10.1, key resend and cancel on the org user id (`/api/organizations/members/:orgUserId/invite/resend`, `DELETE …/invite`); there is one pending invite per email (`upsertPendingInvite`). In 13, resending sets `invited_by` to the resender, who has passed rule 2. Add to 19.8: an invite whose inviter left is accepted after an Admin resends it.

**13 · fixed · The community roster lands on two permissions**
Fixed in spec 5.1 and 11: the roster is `access:read`; `list_community_members` takes its method's permission.
Where: 5.1 (rename line, `access:read` row), 11.
Problem: `list_community_members` (`mcp/tools/community-members.ts:13-24`) and `GET /api/communities/:communityId/members` (`routes/community-moderation.ts:38-63`) call `reporting.admin.communityMembers`. 5.1's rename line maps their scope, `community_members:read`, to `communities:moderate`. The `access:read` row says it covers "a community's roster of grant holders". 11 doesn't list the tool among those that change permission. An implementer can't tell which permission the method declares.
Fix: `reporting.admin.communityMembers` requires `access:read`, as the table says. In 5.1, say `community_members:*` maps to `communities:moderate` for space members only. Add `list_community_members` to 11's list of tools that take their method's permission.

**14 · fixed · Removal has no order, and a refused removal can leave the person half-removed**
Fixed in spec 9.2: core deletes the org user first, then the membership and tokens; test 19.9.
Where: 9.2 ("in the same core operation"), 10.2 rule 3.
Problem: deleting an org user who wrote posts, comments or messages is refused with 409 (`repositories/organizations.ts:295-311`). The Better Auth membership delete and `revokeAllFor` go through Better Auth's adapter, outside core's transaction (`BA/adapter.mjs:305-351`). If they run first, a refused removal leaves the person with an active org user but no membership and no keys. Today the refusal is thrown in `beforeRemoveMember` (`container.ts:851-853`) before Better Auth deletes anything.
Fix: in 9.2, `removePerson` deletes the org user in core's transaction first, so a refusal changes nothing. It then deletes the membership found with `findMemberByOrgId` and calls `revokeAllFor`. A leftover membership after a failure is harmless: `resolveActor` refuses, and a later `grantMembership` reuses it (9.2). Add to 19.9: removing an author is refused and leaves their membership and keys.

**15 · fixed · `revokeAllFor` leaves OAuth access tokens**
Fixed in spec 9.3: `revokeAllFor` deletes access tokens too; test 19.12.
Where: 9.3, 10.2 rule 3.
Problem: `revokeAllFor` removes "keys, app consents and refresh tokens". Today `revokeConnectedApp` also deletes `oauthAccessToken` rows (`better-auth.ts:471-484`). Access tokens live 900 seconds (`identity/access.ts:2`), and the org claim resolves to whichever org user the person has. A person removed and re-invited within that window keeps a working token.
Fix: in 9.3, `revokeAllFor` also deletes the person's access tokens for the org, as `revokeApp` does.

### Open for a decision

**D1 · decided · `members` is also the name of a role**
Decided: (a). The resource is `people` (`people:read`, `people:write`, `people:delete`).
Rule 2 says a resource "is never a database table, a screen or a role". Member is a system role (3, 4.2), and 10.4 defines Students as the people whose org role is Member. So `members:read` reads as "the Member role's holders", while it actually covers everyone in the org.
Options:
- (a) Rename the resource to `people` (`people:read`, `people:write`, `people:delete`), with 10.1's routes under `/api/organizations/people`. The group is already "People", and 10.1 already speaks of people.
- (b) Keep `members:*` and rename the system role's key and default name, for example to `learner`, across 4, 7.7, 10.2, 13, 16 and 17.

Recommendation: (a). It changes only names the spec introduces, and Member stays the role every org starts with.

### Verdict

No, not as written. Two items block it:
- An Instructor scoped to a course can't finish an upload or re-save a lesson (1).
- Deleting an org can never succeed (2).

Items 3 to 15 are corrections in the sections named. Each has a fix that needs no decision. Two of them are naming-rule breaks (7, 11). The rest are gaps in the new people operations, the invite rules and the Better Auth boundary. D1 is the one product choice left.

Everything else holds: every part-5 fix, the permission list's uses across sections 6 to 20, the levels, resolution, escalation, transfer, the Better Auth adapter plan and the `file:line` claims I checked against the code. Once 1 to 15 are fixed and D1 is decided, the spec can be implemented.
