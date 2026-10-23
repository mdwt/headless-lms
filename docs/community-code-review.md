# Community branch code review

Branch `feature/community-impl`, 21 commits ahead of `main` (`4c8f78a` to `948998e`), reviewed on 2026-10-22 against `docs/community-spec.md`, `docs/community-exploration.md`, `docs/architecture.md`, `docs/domain/*.md` and `docs/project-structure.md`.

Checks run on the branch:

| Check | Result |
|---|---|
| `pnpm typecheck` | passes |
| `pnpm test` | 57 files, 636 tests, all pass |
| `pnpm lint` | fails: `packages/core/src/identity/service.test.ts:3` imports `ForbiddenError` and never uses it |

Every finding below was read in the code, not inferred. Each one has the location, what the code does, what the spec or the architecture rules say, a concrete failure, and the fix options ranked by correctness. Nothing is ranked by effort.

Severity:

- **Blocking**: the branch cannot deploy, or a member can reach something a grant does not cover.
- **Spec**: the code does something the spec or exploration says it must not, or omits something it says it must.
- **Architecture**: a rule in `architecture.md` or `AGENTS.md` is broken, or a concept is modelled by overloading another's field or store.
- **Duplication**: the same rule or query exists in more than one place and will drift.
- **Edge**: a wrong result in a specific state that the tests do not cover.
- **Tooling**: tests, lint, naming.

---

## Blocking

### B1. The migration aborts on any database with a resolved comment report

**Where:** `adapters/db/drizzle/0003_community.sql:8-10`

**What the code does:** Adds `resolution` and `resolved_by` as nullable columns, then immediately adds `comment_flags_resolved_check`, which requires `resolved_at`, `resolution` and `resolved_by` to be all null or all set. No statement sets `resolution` or `resolved_by` on existing rows.

**What the spec says:** `community-spec.md:343-350` specifies the two columns and the check constraint. It does not mention existing rows.

**Failure:** Any `comment_reports` row that a moderator ever dismissed has `resolved_at` set. After the rename it has `resolved_at` set and both new columns null. Postgres validates a new `CHECK` constraint against existing rows, so the `ADD CONSTRAINT` fails and the whole migration rolls back. No environment with a resolved report can take the migration.

**Fix options:**

1. Add two `UPDATE` statements between lines 9 and 10: set `resolution = 'dismissed'` and `resolved_by` to a sentinel for rows where `resolved_at is not null`. The sentinel has to be a real `org_users.id` or the column must stay a plain text with no foreign key, which it is in the spec. The existing data does not record who resolved a report, so `dismissed` is the only honest value and the actor is unknown.
2. Add the constraint as `NOT VALID` and leave a follow-up `VALIDATE CONSTRAINT` for after a backfill. This keeps the deploy green but leaves rows that violate the invariant the core service relies on.

Option 1 is correct. Option 2 defers the same decision.

---

### B2. Members can read any asset in the org by pointing a profile, post or message at it

**Where:**
- `packages/core/src/identity/service.ts:107-125` (`updateProfile`)
- `packages/core/src/discussion/posts.ts` create and update paths that store `coverAssetId`
- `packages/core/src/discussion/chats.ts:313-315` (`send` stores `input.assetIds` via `chats.attach`)
- `adapters/db/src/repositories/member.ts:236-320` (`assetVisible`)
- `packages/server/src/http/routes/member/assets.ts:14-36` (`POST /api/member/assets/:id/url`)

**What the code does:** `updateProfile` checks that the two image columns are both set or both null and that the user exists. It does not check that the asset exists, belongs to the org, is of kind `image`, or was uploaded by the caller. The post and message paths store `coverAssetId` and `assetIds` with no check at all. `assetVisible` then answers "yes" when the caller's own profile row points at the asset, when the caller is a participant of a chat whose message links the asset, or when the caller authored a post whose cover is the asset.

**What the spec says:** `community-spec.md:995` says the member URL route "gains an access check" because community attachments need one. The grant-is-the-only-access-path rule means a member reaches a file only through content a grant covers.

**Failure:** A student takes the asset id of a paid download, calls `PUT /api/member/profile` with it as `imageAssetId`, then calls `POST /api/member/assets/:id/url`. `assetVisible` finds the profile row, returns true, and the route mints a signed URL for the paid file. The same works through a post cover or a message attachment, and the attachment variant leaks the file to every other participant too.

**Fix options:**

1. Validate ownership at write time in core. Identity, discussion posts and discussion chats each ask assets whether the referenced asset exists in the org, has kind `image`, and was uploaded by the actor's org user. Assets exposes that as one reader on its index. Then `assetVisible` can trust the link rows.
2. Keep writes open and make `assetVisible` check `assets.uploaded_by = orgUserId` or kind `image` for the profile, cover and attachment branches. This only moves the hole: a member could still attach a paid file and expose it to others through a message.

Option 1 is correct and it is where the model says the rule lives. Option 2 leaves the link rows meaningless.

---

### B3. Orgs that exist before this deploy lose grant emails and never run the schedules

**Where:**
- `packages/core/src/automations/service.ts:233-269` (`seedFor`)
- `packages/core/src/automations/seeds.ts:19-66` (`orgSeeds`)
- `packages/server/src/app/notifications.ts` and its test, deleted on this branch
- `packages/server/src/app/container.ts:449-475`

**What the code does:** The hard-wired `accessGranted` and `accessRevoked` bus subscribers were deleted. Their replacements are two of the six `orgSeeds`, and `seedFor` inserts those only when it handles `organization.created`. The three schedule automations (publish due posts, expire due grants, digest) are in the same list. There is no backfill, no startup sweep, and no migration that inserts rows for orgs already in the table.

**What the spec says:** `community-spec.md:672` says the system automations are "seeded for every org on `organization.created`". `community-spec.md:816` says the duplicate hard-wired subscribers go. The spec is silent on existing orgs, but the intent at `community-spec.md:919` is that the two emails keep being sent.

**Failure:** Every org created before the deploy has no `Access granted` automation, so a grant sends no email. It has no `Publish due posts` automation, so a scheduled post never publishes. It has no `Expire due grants` automation, so `entitlement.expired` and `entitlement.ending_soon` never fire and the membership-ended email never goes out.

**Fix options:**

1. A data migration that inserts the six org seeds for every existing org, with the same dedupe key `seedFor` uses. This is a one-time statement and leaves `seedFor` unchanged.
2. A startup sweep in the composition root that calls `seedFor` for every org on boot. This repeats on every boot and puts a write in the composition root.
3. Lazy seeding: `seedFor` also runs on the first event of any type for an org. This makes the first grant in an old org race its own welcome email.

Option 1 is correct.

---

### B4. No member can upload a file

**Where:**
- `packages/server/src/http/routes/assets.ts:38-40` (every route in the file uses the `staff` preHandler, which calls `resolveScope`)
- `packages/server/src/http/routes/member/assets.ts` (only `POST /api/member/assets/:id/url` exists)

**What the code does:** `POST /api/uploads`, the asset library routes and the finalize route are staff-only. The member surface has a signed-URL route and nothing else. There is no route a student or moderator can call to register an upload.

**What the spec says:** `community-spec.md:118` and `:636` say post covers, message attachments and profile photos are member-supplied assets of kind `image`. `community-spec.md:953` says the admin asset routes get `resolveScope`. The spec never specifies a member upload route, so this gap is partly in the spec.

**Failure:** A member calls `PUT /api/member/profile` with an asset id they cannot have, because they cannot create one. Profile photos, post covers and message attachments are unreachable for every non-staff user. The whole `assetVisible` branch for profiles, covers and attachments is dead for the people it was written for.

**Fix options:**

1. Add `POST /api/member/uploads` and `POST /api/member/uploads/:id/finalize` under `requireOrgSession`, calling the same assets operations with kind forced to `image` and `uploadedBy` set to the actor's org user. This pairs with B2: the write-time ownership check needs `uploaded_by` to exist.
2. Keep one upload route and let `resolveScope` admit members for kind `image` only. This puts a role branch inside a transport, which `transports-have-no-logic` forbids.

Option 1 is correct. The spec should gain a line for the member upload route so the OpenAPI contract has a home for it.

---

## Spec violations

### S1. A student cannot be made a moderator

**Where:**
- `packages/core/src/organizations/service.ts:506-529` (`updateMemberRole`)
- `adapters/db/src/repositories/members.ts:59` (`listMembers` filters `ne(orgUsers.role, STUDENT_ROLE)`)
- `packages/server/src/http/routes/organizations.ts:113-127` (the role route)

**What the code does:** `updateMemberRole` loads the member and throws `Only active members can have their role changed` when `member.kind !== 'member'` or there is no `userExternalId`. A student has an `org_users` row and no Better Auth membership, so the lookup either does not find them or returns a non-member kind. The members repository additionally excludes students from the list the admin app uses to pick a person.

**What the spec says:** `community-spec.md:260`: "A student org user has no Better Auth membership. Giving that person the moderator role creates the membership, the same way accepting a staff invite does." `community-spec.md:684` repeats it: "A student with no membership gets one created."

**Failure:** Rachel opens the team list, does not see James because he is a student, and if she calls the role route with his org user id directly the call is rejected. The reference use case at `community-spec.md:60`, where James holds the moderator role, cannot be set up.

**Fix options:**

1. In `updateMemberRole`, when the target is an `org_users` row with role `student` and no membership, create the Better Auth membership with the requested role through the same path invite acceptance uses, then let the mirror hook write `org_users.role`. The members list query needs a second path that finds a student by org user id for this call.
2. A separate `promoteStudent` operation on organizations that only handles the student case. This splits one spec operation into two and leaves the route doing the branching.

Option 1 is correct.

---

### S2. A message request blocks the recipient, not the sender

**Where:**
- `packages/core/src/discussion/chats.ts:693-695` (`pendingOther`)
- `packages/core/src/discussion/chats.ts:287` (`send` uses it)
- `packages/core/src/discussion/chats.test.ts:474-495`

**What the code does:** `pendingOther` returns true when the chat is direct, pending, and `chat.createdBy !== actor.id`. `send` throws `You cannot send in this chat` when it is true. So the creator can keep sending into a pending chat and the recipient cannot reply. The test at line 474 is titled "keeps the creator from sending ahead of that" and asserts the opposite: `other` is blocked and `member` sends.

**What the spec says:** `community-spec.md:113` defines a message request as "a DM whose recipient has not yet accepted it". `community-spec.md:470` says the DM is pending until the recipient accepts. The exploration's intent is that the recipient sees one message and decides; the sender does not get to keep writing.

**Failure:** Sarah starts a DM to James where first messages are requests. Sarah sends ten more messages before James has accepted. James opens the request and cannot type a reply without first calling accept. Nothing stops a sender from flooding an unaccepted request.

**Fix options:**

1. Invert the rule: in a pending direct chat, only the creator is blocked after the first message, and the recipient may send, which implicitly accepts. `startDirect` already writes the first message, so `send` should throw for the creator while `status === 'pending'`. Rename the test to match and flip its assertions.
2. Block both sides until explicit accept. Simpler, but the spec's "recipient accepts" reads as a decision, and a reply is the natural acceptance.

Option 1 is correct.

---

### S3. Removing a post, comment or message leaves its flags open

**Where:**
- `packages/core/src/discussion/posts.ts:198-222` (`remove`)
- `packages/core/src/discussion/posts.ts:380-396` (`resolveFlags`, separate call)
- `packages/core/src/discussion/service.ts` comment `remove`, no flag write
- `packages/core/src/discussion/chats.ts` `deleteMessage` and `setLock`, no flag write

**What the code does:** Each moderation action updates the item and emits its event. None of them touch the flags table. Flags are resolved only through the dedicated `resolveFlags` calls, which a client has to make as a second request.

**What the spec says:** `community-exploration.md:292`: "Acting on the item resolves its flags. A flag never changes the item on its own; only a moderator's action does." `community-exploration.md:156`: "James removes the post: it disappears for members and the flags are resolved as removed."

**Failure:** Two members flag a post. James removes it. The space queue still lists the post with two open flags. Rachel opens the queue, sees a removed post, and has to resolve it by hand. If she dismisses instead of removing, the row records `dismissed` on an item that was removed.

**Fix options:**

1. `remove` (posts and comments), `deleteMessage` and `setLock(locked=true)` resolve the item's open flags inside the same unit-of-work transaction with the matching resolution (`removed`, `deleted`, `locked`). Keep `resolveFlags` for the dismiss path only.
2. Keep the two-call shape and have the client call both. This leaves the invariant to every client and violates the exploration.

Option 1 is correct.

---

### S4. A lapsed member can still read and send in their chats

**Where:**
- `packages/core/src/discussion/chats.ts:269-320` (`send`)
- `packages/core/src/discussion/chats.ts:539-550` (`messages`)
- `packages/core/src/discussion/chats.ts:677-691` (`requireActive`, `assertActive`)

**What the code does:** `send` checks that the actor is a participant, that the chat is not locked or closed, and that every other participant still has a role in the community. It never checks the actor's own community access. `messages` checks only participation.

**What the spec says:** `community-spec.md:955`: "A removed or expired grant closes everything at once: spaces, feeds, chats, directory." `community-spec.md:692` says every member-facing operation starts with the grant question.

**Failure:** Tom's grant to Founder Collab expires. He still has a chat with Sarah. He opens it, reads the history, and sends messages. Sarah's side checks Tom's role when she replies and fails, so the chat is one-directional: Tom can write, Sarah cannot.

**Fix options:**

1. `send`, `messages`, `editMessage`, `markRead` and every other chat operation call `requireActor(orgId, actor, chat.communityId)` first, the way `startDirect` does. This is one line per operation and matches the spec's "every operation starts with the grant".
2. A single guard in `mustChat` that takes the actor and checks access. Cleaner, but `mustChat` is also used by staff queue paths where staff pass by role, so it needs the role branch inside.

Option 1 is correct.

---

### S5. Starting a DM that already exists drops the first message silently

**Where:** `packages/core/src/discussion/chats.ts:67-72, 96`

**What the code does:** Inside the transaction, after taking the pair lock, `findDirect` returns an existing chat and the method returns it. The `input.body` the caller supplied is never written. The route returns 201 with the existing chat.

**Failure:** Sarah had a DM with James months ago. She opens the compose screen, writes a long message, and submits. The API returns the old chat and the message is gone. Nothing in the response says the body was discarded.

**Fix options:**

1. When an existing chat is found and `input.body` is not null, write the message into it through the same `send` rules (lock, closed, pending, blocked), then return the chat. The caller gets one call that does what it says.
2. Return a conflict when a direct chat already exists and the body is non-null. Honest but forces the client to handle a second code path.

Option 1 is correct.

---

### S6. The schedule runs on an in-process timer in both engines, with a cron matcher that only handles `*` and lists

**Where:**
- `packages/core/src/automations/schedule.ts:3-22` (`cronMatches`)
- `packages/core/src/automations/schedule.ts:24-65` (`startScheduleLoop`)
- `adapters/workflow-hatchet/src/index.ts:106-107` (Hatchet engine calls `startScheduleLoop`)
- `adapters/defaults/src/workflows/index.ts:46`

**What the code does:** `cronMatches` splits five fields and matches each as either `*` or a comma list of integers. It evaluates everything in UTC. `startScheduleLoop` sets a 60-second `setInterval`, floors `now` to the minute on each tick, lists every enabled automation across every org, and fires the ones that match. The Hatchet adapter calls the same loop instead of registering Hatchet crons.

**What the spec says:** `community-spec.md:662`: "the Hatchet engine registers a cron for every enabled automation that has a schedule trigger, and the inline engine uses a timer." `community-spec.md:667`: `0 7 * * *` is "daily at 07:00 in the org's timezone". `community-spec.md:710` repeats that the Hatchet engine registers crons.

**Failure:**
- A user types `*/5 * * * *`. `Number('*/5')` is `NaN`, the field never matches, and the automation silently never fires. Same for `1-5` and `MON`.
- The digest fires at 07:00 UTC for every org regardless of timezone.
- Two API replicas on Hatchet both run the loop, both match the same minute, both call `fireSchedule`. The run dedupe on `schedule_<id>_<time>` stops the second insert, but both replicas still did the listing work, and the second one logs a failure for every automation every minute.
- `setInterval` drifts. When a tick lands at 06:59:59.800 and the next at 07:01:00.100, `now` floors to 06:59 and 07:01 and the 07:00 slot is skipped. There is no catch-up.

**Fix options:**

1. Hatchet engine registers one cron per enabled schedule automation on `register()` and re-syncs on `automation.created`, `.updated`, `.deleted`. Inline engine keeps a loop but tracks `lastFired` per schedule and walks every minute between `lastFired` and `now` so a missed slot fires late rather than never. `cronMatches` either supports the full five-field grammar (ranges, steps, names) or validates at automation create time and rejects anything it cannot match. Org timezone needs a column on `organizations` and `cronMatches` takes a zone.
2. Keep the loop in both engines and only fix the matcher and drift. Still violates the spec's Hatchet line and still runs the loop on every replica.

Option 1 is correct.

---

### S7. `editMessage` ignores lock, closed state, and whether the editor is still in the chat

**Where:** `packages/core/src/discussion/chats.ts:323-345`

**What the code does:** Loads the message, checks `orgUserId === actor.id` and `deletedAt`, then writes. It never loads the chat.

**What the spec says:** `community-spec.md:470`: "a locked chat is readable, and no participant can send to it." Editing is a write.

**Failure:** Staff lock a chat because of abuse. The abuser edits every earlier message to new content. A participant who left the chat rewrites old messages they can no longer see.

**Fix:** Load the chat, require the actor to be an active participant, and refuse when `lockedAt` is set or `status === 'closed'`. One guard, reused by `deleteMessage` if it has the same gap.

---

### S8. `listSpaceMembers` shows requested, invited and revoked rows to any member who can open the space

**Where:**
- `packages/core/src/entitlements/service.ts:302-312`
- `packages/server/src/http/routes/member/community.ts:78-91`

**What the code does:** The guard is `canOpenSpace`. For an `all_members` space that is every member. The repository returns every row regardless of status.

**What the spec says:** `community-spec.md:970` gives moderation to staff and moderators. The pending request list is moderation state. `community-spec.md:985` says removed items are "not served to members; staff and the queue see it".

**Failure:** A member of a by-request space lists its members and sees who asked and was declined, who was invited and has not answered, and who was removed and why.

**Fix:** Return only `active` rows to a plain member and the full set to staff and moderators. Two repository calls or one with a status filter driven by the role check in core.

---

### S9. The digest fires for draft communities

**Where:**
- `packages/core/src/discussion/service.ts:740-758` (`sendDigest`)
- `packages/server/src/app/community-mail.ts:40-54` (`listCommunityIds`)
- `adapters/db/src/repositories/content.ts:1103-1106` (`listCommunities` filters status only when `query.status` is set)

**What the code does:** `sendDigest` emits `discussion.digest.due` for every community id returned by `listCommunities` with no status filter.

**Failure:** A draft community with no members emits a digest event every morning. The digest derivation is silenced today, so no email goes out, but the run and the event are recorded daily for a community nobody can open.

**Fix:** Pass `status: 'published'` to `listCommunities`, or give content a `listPublishedCommunityIds` reader so the discussion service does not need to page.

---

## Architecture

### A1. A 230-line read layer in the composition root that bypasses context services

**Where:** `packages/server/src/app/community-mail.ts`

**What the code does:** `communityMail` builds the `CommunityMailReads` port by calling Drizzle repositories directly: `deps.entitlementsRepo.hasCommunityAccess` (lines 119, 205), `deps.entitlementsRepo.listSpaceMembers` (196), `deps.postReads.followerIds` (149), `deps.postReads.find` (159), `deps.discussionReads.findComment` (152), `deps.chatReads.findChat`, `.participants`, `.listMessages`, `.isBlocked` (172-193), `deps.runsRepo.recentRecipients` (216), and `deps.organizationsRepo.findOrgUserById` (95, 133). The `Deps` type imports the concrete Drizzle classes from `@headless-lms/adapter-db` by name.

**What the architecture says:** `AGENTS.md`: `@headless-lms/server` is `app/` (composition root) and `http/` only. Contexts expose readers through their `index.ts`. The memory rule `transports-have-no-logic` says missing operations go into core, shared by all callers. `community-spec.md:923`: "The derivation reads the event, resolves recipients through entitlements (who can open the space), discussion (followers, participants, mutes, blocks) and organizations (staff, moderators)."

**Failure:** Every rule the services enforce is skipped here. `moderationAudience` calls the repository access check instead of `entitlements.isCommunityMember`, so if the service rule changes the mail audience does not. `followerIds`, `comment`, `post` and `chat` return raw rows with no visibility rule applied. The file is a second implementation of five contexts' read paths that no context owns and no context test covers.

**Fix options:**

1. Each context exposes the reader it already has (entitlements: `isCommunityMember`, `openSpaceIds`, `grantOpensCommunity`, `listSpaceMembers`; discussion: followers, comment, post, chat, latest message, pair blocked; organizations: staff ids, moderator ids, display name) on its `index.ts`. `community-mail.ts` shrinks to a mapping of port method to service method with no logic, or disappears into the container.
2. Move `community-mail.ts` into automations as a `CommunityMailReads` adapter that takes the five services. Still cross-context, but inside core and testable.

Option 1 is correct. Option 2 is where to land if the reader additions are refused.

---

### A2. The outbox is used as a ledger

**Where:**
- `packages/core/src/entitlements/service.ts:314-351` (`expireDue`)
- `adapters/db/src/repositories/entitlements.ts:546-567` (`outboxHas`)

**What the code does:** Before emitting `entitlement.expired` or `entitlement.ending_soon`, `expireDue` asks the outbox whether an event of that type with `payload->'data'->>'id'` equal to the grant id (and `payload->'data'->>'contentId'` equal to the community id) already exists. That is the only record of "this grant has been expired" or "this reminder was sent".

**What the architecture says:** `architecture.md` describes the outbox as a delivery buffer. It has no index on payload fields and nothing stops a retention job from pruning it.

**Failure:**
- `outboxHas` is a sequential scan of `event_outbox` filtered by a JSON path, once per expired grant and once per ending grant per community, every hour, for every org.
- The moment an operator adds outbox retention, every grant that expired before the cutoff is "unseen" again and gets a second `entitlement.expired`. Every member whose reminder was pruned gets a second ending-soon email.
- The spec at `community-spec.md:670` says "grants ... that have not yet been expired", which is a fact about the grant, not about the outbox.

**Fix options:**

1. Record the facts on the grant: an `expired_at` column set when `entitlement.expired` is emitted, and an `ending_soon_notified_at` column, or a small `entitlement_reminders (org_id, entitlement_id, community_id, sent_at)` table for the per-community reminder. `expireDue` then selects `expires_at < now and expired_at is null`. This matches `no-field-overloading-hacks`.
2. Change the grant status to `expired` on expiry. The spec at `community-spec.md:264` says expiry is derived from `expires_at` and status stays `active` or `revoked`, so this is a spec change.

Option 1 is correct.

---

### A3. `entitlement.ending_soon` overloads `contentId` on a bundle grant

**Where:** `packages/core/src/entitlements/service.ts:342`

**What the code does:** `data: { ...grant, contentId: communityId }`. For a bundle grant the row has `bundleId` set and `contentId` null. The event rewrites `contentId` to the community id, so the payload carries both a `bundleId` and a `contentId`, which no real grant row can.

**What the spec says:** `community-spec.md:840` says the Membership ending soon automation filters on "`contentId` of this community", so the spec asked for this shape. `community-spec.md:264` also says a grant has "one target that is a content item or a bundle". The two sentences conflict for bundle grants.

**Failure:** A webhook consumer receives an `entitlement.ending_soon` whose data is a grant with two targets. A consumer that keys on `contentId` to find "the thing the grant covers" now gets the community for a grant that covers a bundle. `outboxHas` at `entitlements.ts:561` also keys on this overloaded field.

**Fix:** Add `communityId` to the event data beside the unmodified grant row, filter the seeded automation on `communityId`, and update the spec line. The grant stays a grant.

---

### A4. Optional dependencies with silent stubs

**Where:**
- `packages/core/src/automations/service.ts:155-157, 186-192` (`mail?`, `grants?`, `scheduledWork?` with `emptyCommunityMail`, a throwing `grant`, and `emptyScheduledWork`)
- `packages/core/src/discussion/service.ts:52, 73` (`communities?` defaulting to `listIds: async () => []`)

**What the code does:** A container that forgets to wire one of these gets a service that compiles, starts, and does nothing. `sendDigest` with the stub logs "no communities for digest" and returns. `expireDueGrants` with the stub is a no-op. Every community mail derivation gets `null` from every lookup and sends nothing.

**Failure:** A future wiring change or a test container drops one dependency and every schedule silently stops. Nothing fails loudly.

**Fix:** Make them required constructor parameters. The tests that construct these services pass explicit fakes already.

---

### A5. The schedule timer lives in core

**Where:** `packages/core/src/automations/schedule.ts:24-65`

**What the code does:** `startScheduleLoop` owns a `setInterval`, swallows every error from `listSchedules` and `fireSchedule`, and is exported from `@headless-lms/core/automations` for adapters to call.

**What the architecture says:** Core holds domain rules and ports. Timers, workers and processes are adapter concerns; `community-spec.md:710` puts the timer in the defaults adapter and the crons in the Hatchet adapter.

**Fix:** Keep `cronMatches` in core as a pure rule. Move the loop into `adapters/defaults`. The Hatchet adapter registers crons (S6).

---

### A6. The space-open rule is re-implemented in SQL

**Where:**
- Rule owner: `packages/core/src/entitlements/service.ts:119-139` (`canOpenSpace`)
- Copy: `adapters/db/src/repositories/member.ts:262-278` (inside `assetVisible`: `p.status = 'published' and (role = 'moderator' or s.access_rule = 'all_members' or exists space_members active) and activeGrantCovers`)

**What the spec says:** `community-spec.md:692`: "The rule for opening a space is defined here and nowhere else."

**Failure:** When the rule changes (a new access rule, a different moderator scope), the SQL copy does not.

**Fix:** `assetVisible` answers which content the asset belongs to. Reporting then asks entitlements `canOpenSpace` or `hasCommunityAccess` for that content. Or, if it must stay one query, the SQL fragment is generated from one place that entitlements owns.

---

### A7. Comments added to the code

**Where:**
- `adapters/db/src/schema/discussion.ts:1-2, 5, 11-15` (new on this branch)
- `packages/core/src/automations/actions.ts:1-8` (lines 7-8 new on this branch)

**What `AGENTS.md` says:** "Don't add comments in the code."

**Fix:** Delete them. The schema header and the derivation table description belong in `docs/domain/discussion.md` and `docs/domain/automations.md` if they are worth keeping.

---

## Duplication

### D1. Four implementations of "an active grant covers this content"

**Where:**
1. `adapters/db/src/repositories/entitlements.ts:336-376` (`hasCommunityAccess`, Drizzle joins over `entitlements`, `content_items`, `bundle_items`)
2. `adapters/db/src/repositories/member.ts:26-36` (`activeGrantCovers`, raw SQL `exists`)
3. `adapters/db/src/repositories/member.ts:166-184` (`directory`, inline `opens` fragment with `content_items.type = 'community'` check)
4. `adapters/db/src/repositories/admin.ts:506-522` (`communityAnalytics`, the same `opens` fragment copied verbatim)

Plus the pre-existing `hasCourseAccess` at `entitlements.ts:300-334` and `grantWhere` at `member.ts:44`.

**Differences between the copies:** 2 does not check `content_items.type`. 3 and 4 do. 1 checks it through a join alias. If a bundle contains a course with the same id shape, 2 passes and 3 fails. The expiry predicate is `expires_at > now()` in 2 and 3, `>= now()` in 4's `live`.

**Fix:** One SQL fragment builder in the db adapter, exported from a shared file, that takes `(orgId, orgUserId, contentId)` and optionally a type. Every copy calls it. Then `hasCommunityAccess` and `hasCourseAccess` become one `hasAccess(orgId, orgUserId, contentId, type)`.

---

### D2. The staff role list is hardcoded in SQL

**Where:**
- `adapters/db/src/repositories/member.ts:202` (`directory`)
- `adapters/db/src/repositories/member.ts:246` (`assetVisible`)

**What exists:** `packages/core/src/organizations/roles.ts:12` exports `STAFF_ROLES`.

**Fix:** Pass `STAFF_ROLES` into the query with `inArray`, or have the service decide staff before calling the repository.

---

### D3. `postComments` copies `activityComments` threading

**Where:**
- `packages/core/src/discussion/service.ts:302-333` (`postComments`)
- `packages/core/src/discussion/service.ts:365-400` (`activityComments`)

**What the code does:** The readable filter, the held-open roots, the reply filter, the sort, the authors and reactions fan-out are the same 25 lines twice, with `isStaff` in one and `canModerate` in the other.

**Fix:** One private `thread(rows, actor, reactionsOn)` that both call. The moderator difference is the only parameter.

---

### D4. `visiblePost` copies `loadVisible`

**Where:**
- `packages/core/src/discussion/service.ts:335-355`
- `packages/core/src/discussion/posts.ts:633-647`

**Fix:** The post service exposes `loadVisible` as `visible(orgId, actor, postId)` on its interface and the discussion service calls it.

---

### D5. `requireOpen` fetches the space, then `canOpenSpace` fetches it again

**Where:**
- `packages/core/src/discussion/posts.ts:622-631`
- `packages/core/src/entitlements/service.ts:120`

Every post read and write does two `getSpace` calls. `visiblePost` in the discussion service does the same.

**Fix:** `canOpenSpace` takes the already-loaded space, or returns the space it loaded.

---

### D6. N+1 patterns in the mail read layer

**Where:** `packages/server/src/app/community-mail.ts`

- `moderationAudience` (110-124): pages `listMembers` four times, once per role, then one `hasCommunityAccess` query per moderator.
- `staffIds` (125-131): three full pages of `listMembers`.
- `memberCommunityTitles` (199-214): pages every community, then one `hasCommunityAccess` per community.
- `openSpaceNames` (94-106): `openSpaceIds` already loaded every space; the method then calls `getSpace` once per id.
- `activeMemberCount` (195-198): loads every space member row to count the active ones; `countActiveSpaceMembers` exists on the repository.
- `send` in `chats.ts:293-303`: one `isBlocked` and one `personRole` query per other participant per message. In an 8-person group chat that is 14 queries before the insert.

**Fix:** One query per question. `listMembers` takes a role list. Entitlements gets `communitiesOpenedBy(orgUserId)` and `moderatorsWithAccess(communityId)`. `openSpaceIds` returns spaces, not ids. `send` loads the roles and blocks of all participants in one query each.

---

### D7. `recentRecipients` filters in JavaScript

**Where:** `adapters/db/src/repositories/automations.ts:380-420`

**What the code does:** Selects every completed run of the automation since `since`, then checks `event.data.chatId` in a loop. For the New message automation in a busy community, that is every message run in the last 15 minutes across every chat, loaded to pick one chat's.

**Fix:** Filter on `event->'data'->>'chatId'` in the `WHERE`, with an expression index if the table grows.

---

### D8. `listSchedules` loads every enabled automation across every org every minute

**Where:** `adapters/db/src/repositories/automations.ts:179-199`

**Fix:** A `WHERE` on the triggers array (`exists (select 1 from unnest(triggers) t where t like 'schedule:%')`) or a boolean column set on write.

---

### D9. The message queue is served on two routes

**Where:**
- `packages/server/src/http/routes/communities.ts:212-222` (`GET /api/communities/:id/message-queue`, `resolveScope`)
- `packages/server/src/http/routes/member/chats.ts:65-76` (`GET /api/member/communities/:communityId/message-queue`, `requireOrgSession`)

Both call `chats.messageQueue`, which throws for non-staff. The member route exists only to 403.

**What the spec says:** `community-spec.md:971`: the message queue is staff only. `community-spec.md:718`: staff routes live under `/api/communities`.

**Fix:** Delete the member route.

---

### D10. `filterMatches` evaluated twice per automation per event

**Where:** `packages/core/src/automations/service.ts:204-205`

**Fix:** Evaluate once into a local.

---

### D11. `communitySeeds` seeds unfiltered automations per community

**Where:** `packages/core/src/automations/seeds.ts:70-90` (`Welcome to the community` and `Membership ended` have `filter: null`)

**What the code does:** Every community gets its own `Welcome` automation with no filter. One `entitlement.created` in an org with ten communities opens ten runs, nine of which derive to nobody. Same for `Membership ended`.

**Fix:** Either one org-wide welcome automation whose derivation walks `communitiesOpenedBy(grant)`, or a filter that the engine can evaluate (which needs the event to carry the community, which A3 provides).

---

## Edges

### E1. Leaving a direct chat is a dead end

**Where:** `packages/core/src/discussion/chats.ts:227-244` (`leave`), `adapters/db/src/repositories/chats.ts:114-140` (`findDirect` ignores `left_at`)

**Failure:** Sarah leaves her DM with James. `findDirect` still finds the chat because the `chat_users` row remains. `startDirect` returns it, drops the body (S5), and `send` rejects Sarah because she is not active. Sarah can never message James again in that community.

**Fix:** Either `leave` is refused on direct chats, or `startDirect` re-joins the actor (clears `left_at`) when the direct chat exists.

---

### E2. `restore` always publishes

**Where:** `packages/core/src/discussion/posts.ts:224-250`

**Failure:** A post was pending review, a moderator removed it, then restores it. It goes straight to `published` without the review the space requires.

**Fix:** Restore to the status the post held before removal. `metadata.previousStatus` is on the `post.removed` event but not on the row; a `removed_from_status` column or re-deriving from the space's review rule is needed.

---

### E3. `schedule` accepts a pending post

**Where:** `packages/core/src/discussion/posts.ts:143-167`

**Failure:** An author submits for review (pending), then calls schedule. The post leaves the queue silently and comes back through `publishDue` as a fresh submission.

**Fix:** Reject `schedule` when status is `pending`, matching the spec's state list at `community-spec.md:355`.

---

### E4. `seedFor` can insert duplicates on redelivery

**Where:** `packages/core/src/automations/service.ts:238-262`

**What the code does:** List-then-insert inside a transaction with no unique constraint on `(org_id, source, name, filter)`. Two deliveries of the same `community.created` (the relay retries on timeout) can both pass the "missing" check.

**Failure:** Twenty duplicate system automations that cannot be deleted because `source = 'system'`.

**Fix:** A unique index on `(org_id, name) where source = 'system'` plus `on conflict do nothing`, or the seed key stored as a column.

---

### E5. `setSpaceTopics` cannot swap two names

**Where:** `adapters/db/src/repositories/content.ts:1440-1450`

**What the code does:** Updates one topic row at a time. With a unique constraint on `(org_id, space_id, name)`, renaming A to B while B exists fails on the first update.

**Fix:** Defer the constraint, or update to temporary names first, or delete and reinsert in one statement.

---

### E6. Every space-member route takes `:communityId` and never checks it

**Where:** `packages/server/src/http/routes/member/community.ts:78-250` (eleven routes)

**What the code does:** The handler passes `req.params.spaceId` to core and ignores `req.params.communityId`. The community segment is decorative. A request for `/communities/A/spaces/S/...` where S belongs to community B succeeds.

**Fix:** Either drop the segment (`/api/member/spaces/:spaceId/...`) or have core take both ids and 404 on mismatch.

---

### E7. `GET /api/member/profile` returns 404 for a member who has never saved one

**Where:** `packages/server/src/http/routes/member/profile.ts:23-29`

**Fix:** Return an empty profile shape for the session user. A profile is per person and always conceptually exists.

---

### E8. The ending-soon email prints a raw ISO timestamp

**Where:** `adapters/email-templates/src/emails/community.tsx:62`

**Output today:** `Your access ends 2026-10-28T00:00:00.000Z.`

**Fix:** Format the date in the template with the org's locale, or have the derivation pass a formatted string and a day count.

---

### E9. One missing email address fails the whole audience

**Where:**
- `packages/core/src/automations/community-mail.ts:145-166` (`address` returns `undefined` when any recipient has no email)
- `packages/core/src/automations/actions.ts:93-96` (undefined throws, the run fails, the engine retries)

**Failure:** A space with one member whose `users.email` is null. Every New post, Join request and Something was flagged email to that space fails and retries. Nobody in the space gets any email.

**Fix:** Skip the recipient without an address and send to the rest. Log the skipped id.

---

### E10. The minute cron writes a run and two outbox events per org per minute

**Where:** `packages/core/src/automations/service.ts:306-330` (`openRun` inserts a run and emits `automation.run.started`; `finalize` emits `.run.finished`)

**What the code does:** `Publish due posts` on `* * * * *` opens a run every minute whether or not a post is due. Per org per day that is 1,440 `automation_runs` rows and 2,880 outbox rows for an operation that is almost always a no-op.

**Fix:** The scheduled action checks for due work before opening a run, or the run is opened only when the action reports work. Or the system schedule is `*/5` once S6 supports steps.

---

### E11. `deleteCommunity` deletes settings in the transaction and the spec says the event handler does

**Where:** `packages/core/src/content/service.ts:735`

**What the spec says:** `community-spec.md:150`: "Handling `content.community.deleted` deletes it."

This is a deviation, but the in-transaction delete is the more correct behaviour. Update the spec line rather than the code.

---

## Tooling

### T1. Lint fails

`packages/core/src/identity/service.test.ts:3`: `ForbiddenError` imported, unused.

### T2. A test asserts the opposite of its title

`packages/core/src/discussion/chats.test.ts:474`: "keeps the creator from sending ahead of that" asserts the recipient is blocked and the creator sends. Fix with S2.

### T3. `CommentEvent` names every discussion event

`packages/core/src/discussion/events.ts:183, 195` and `index.ts:57`. The union now covers posts, chats and messages. Rename to `DiscussionEvent`.

---

## What matched the spec

- The migration's table set, column names, check constraints and indexes match the data model section line for line, apart from B1.
- All twenty-three events exist with the specified names, data shapes and `publicData` strippers. Message bodies never leave the system.
- `metadata.actorOrgUserId` and `metadata.previousStatus` are set where the spec lists them.
- Capacity is enforced with a row lock inside the approve and accept transactions (`entitlements/service.ts:525-545`).
- `assertConfigurator` restricts community configuration to owner and admin (`content/service.ts:71-75`).
- The moderator role exists in Better Auth (`adapters/auth/src/access.ts:33`), in `ROLES`, in the authorization matrix (`roles.ts:73`), and in the OpenAPI enums.
- Staff routes use `resolveScope`, member routes use `requireOrgSession`, and every handler is a schema and one core call.
- The space-open rule in `canOpenSpace` is correct as written: staff pass, moderator passes the space check but not the community check, `all_members` needs the grant, `by_request` and `by_invite` need an active row on top.
- `newPostInSpace` and `digest` derivations are silenced pending the email-preference decision, as `community-spec.md:835` requires.
- The system automations are `source = 'system'` and cannot be deleted.

---

## Second pass

Reviewed again on 2026-10-22 after the fix commits from `8150241` to `4144428` and the assets work in `7366d0d`. Every fix commit was read in full. The chat, post, entitlement, organization, automation, email and route changes do what their items asked and the tests cover them. Three things were found in those commits and corrected in this pass:

- The profile route built an empty profile inline when none was stored. The rule that transports carry no logic puts that default in identity, which now exposes `profileOf`.
- The welcome and membership-ended seeds stayed per community with no filter, so one grant event opened one run per community. They are org-wide now and their derivation asks entitlements which communities the grant opens.
- The outbox scan that stood in for an expiry ledger was keyed on the renamed `communityId` field but was still a scan of the outbox. It is replaced by the `entitlement_notices` table.

Decisions taken for the items that were still open:

- **S6.** The Hatchet engine registers one cron per enabled schedule automation through the Hatchet cron client, reconciling on start and whenever an automation is created, updated, deleted or seeded. The inline engine keeps the catch-up loop in the defaults adapter. Every schedule runs in UTC, and the spec line that said "in the org's timezone" now says UTC. An org timezone is a separate feature and nothing in the code or the spec claims it.
- **B3 and E4.** One migration, `0005_notices_and_seed_index.sql`, removes duplicate system rows, adds a partial unique index on `(org_id, name, filter community)` for system rows, and inserts the nine org seeds for every existing org with `ON CONFLICT DO NOTHING`. The same migration creates the notices table and backfills it from the outbox so no grant is expired or reminded twice across the deploy.
- **A1 and D6.** The composition root's mail layer calls only context services. Entitlements gained `openSpaceIdsFor`, `moderatorsWithAccess`, `communityIdsOpenedFor`, `communitiesOpenedBy`, `membersAmong` and `countActiveSpaceMembers`; organizations gained `orgUserIdsByRole` and `getOrgUserById`; identity gained `displayName`; posts gained `visible`, `find` and `followerIds`; chats gained `getMessage`, `chatSummary`, `latestMessageBody` and `isBlocked`. The moderation audience is two queries, member community titles is one query plus one read per community, and `send` loads roles, blocks and membership for all participants in one query each.
- **A2.** `entitlement_notices` is the ledger. The grant row does not change, as the spec requires.
- **A6 and D1.** The space-open rule exists only in `canOpen`, which takes a loaded space. One SQL fragment, `grantOpens`, says what it means for a grant to open a content item, and `activeGrantCovers` builds on it. Course access, community access, the directory, the moderator audience, the member-among query and the analytics all use it.
- **D4 and D5.** `visiblePost` is gone; the discussion service asks the post service, and the post service checks the loaded space once.
- **D9 and D11.** The member message-queue route is deleted. The per-community welcome and membership-ended seeds are org-wide.

## Third pass

Reviewed again on 2026-10-22 against the code at `f6fd57d`. Six reviewers read every tracked item in the code and traced its failure scenario, and swept the spec, the exploration and the domain docs line by line. The second pass had closed most items, but not all of them:

- **Not fixed:** E5. The topic swap wrote a temporary name containing a NUL byte, which Postgres text rejects, so every topic edit that kept a topic failed.
- **Partly fixed:**
  - A1: the composition root still held pagination, the published filter, staff ∪ moderators, a name fallback and the upload grace window.
  - A2: the notice ledger was keyed per grant, so a renewed grant was never expired or reminded again, and the hourly select scanned every grant that ever expired.
  - A7: new comments were added elsewhere on the branch.
  - D1: the analytics `>=` boundary and a Drizzle copy of the opens rule remained.
  - D5: entitlements still loaded the space twice.
  - D6: `openSpaceNames` still listed spaces twice, and `memberCommunityTitles` still made one read per community.
  - S1: any staff role could promote a student to owner, because the student path skipped `manage_users`.
  - S3: `resolveFlags` still accepted `removed`.
  - S4: `getMessage` still served a lapsed participant.
- **Regression:** C1 below. Staff could no longer delete a flagged message in a chat they were not in.

The third pass also found new defects. The tables below list every one, with the decision taken.

### Organizations

| ID | Finding | Decision |
|---|---|---|
| O1 | Promoting a student called Better Auth server-side with no permission check; any staff role could make a student owner or admin | Core checks `manage_users` on the actor for every role change, invite and member removal; no role change or invite grants `owner` |
| O2 | A moderator could not be made a student again | Changing a moderator to student removes the membership and keeps the org user as a student |
| O3 | `organization.user.updated` had no actor | The role route records the actor on the mirror event |
| O4 | The admin app had no way to give a student the moderator role | Students list: Make moderator. Team list: Remove moderator role |

### Chats

| ID | Finding | Decision |
|---|---|---|
| C1 | Staff could not delete a flagged message in a chat they were not in, or in a locked chat | The writable-chat guard applies to the author only |
| C2 | A DM request started without a body could never carry a message; attachments without a body were dropped | A request is started with its message; while pending the creator cannot send |
| C3 | `getMessage` served a lapsed participant and the attachments of a deleted message | Grant check for non-staff; a deleted message carries no attachments for non-staff |
| C4 | One lapsed member stopped every send in a group | Lapsed members are skipped in a group; a DM still refuses |
| C5 | Adding a person checked every pair already in the group | Only the new person against each active participant, in one query |
| C6 | Rejoining a DM committed before the send was checked; a DM rejoin emitted `chat.participant.added` | Send rule first, one transaction; a DM rejoin emits `chat.updated` |
| C7 | Staff DMs became message requests | A request only between two people who are not staff |
| C8 | Flagging a message twice returned 409 | Returns the existing flag, emits nothing |
| C9 | Resolving message flags could record `deleted` or `locked` without acting | The resolve route accepts `dismissed` only |
| C10 | "Muted until unmuted" could not be expressed | A mute is `null` or `{ until }`, `until: null` meaning until unmuted; `'infinity'` stays in the adapter |
| C11 | The message queue did not serve the chat | Each entry carries the message, its flags, the chat and its participants |

### Posts and comments

| ID | Finding | Decision |
|---|---|---|
| P1 | Removing a draft and restoring it published a post the author never submitted | Only a published or pending post can be removed |
| P2 | An author removing their own post resolved the flags against them | Flags are resolved by a moderator's or staff's removal only |
| P3 | Comments were accepted on unpublished posts and emailed to followers | Comment only on a published post |
| P4 | Publish due posts ignored whether the author could still open the space and the topic rule | Same checks as submit; a refused post goes back to draft |
| P5 | Submit skipped the topic rule | Submit checks it |
| P6 | Staff and moderators could read members' drafts and scheduled posts | Author only |
| P7 | Post routes ignored `:communityId` | Core refuses a space of another community |
| P8 | Flagging a post twice returned 409 | Returns the existing flag |
| P9 | Resolving post flags accepted `removed` | `dismissed` only |
| P10 | No saved list and no own-posts list | `GET …/own-posts` and `GET …/bookmarks` |
| P11 | Feeds paged by offset | Keyset cursor on `(pinned, published_at, id)`; a malformed cursor is a 400 |
| P12 | Moderators could not dismiss comment flags | `DELETE /api/member/comments/:commentId/reports` |
| P13 | Authors and senders carried no profile | One author view (display name, headline, photo in this org only) for comments, posts and messages |

### Entitlements

| ID | Finding | Decision |
|---|---|---|
| N1 | Notices keyed per grant silenced a renewed grant; `''` meant "no community"; check-then-insert could emit twice; the select scanned every expired grant | Two notice tables keyed per term, claimed by one insert that copies the term in SQL and re-checks the due predicate |
| N2 | The first run after deploy would emit `entitlement.expired` for every grant that ever expired | The migration records an expiry notice for every grant already expired |
| N3 | Four different expiry boundaries | One predicate and its negation everywhere, the admin app included |
| N4 | `communitiesOpenedBy` copied the opens rule | Built on the shared rule |
| N5 | The community-member rule lived in four places | One SQL answer, used by every caller and the directory |
| N6 | `openSpaceIds` re-implemented `canOpen` | One pure space-open rule |
| N7 | `listSpaceMembers` loaded the space twice | Once |
| N8 | Capacity counted members whose grant lapsed | Counts holders of the published community |
| N9 | Space-member transitions were not conditional | Row lock and status check inside the transaction |
| N10 | Approve did not check the requester's grant | It does |
| N11 | An unpublished community was usable by grant holders | Closed to everyone but staff, moderators included |
| N12 | The grant-access action overwrote expiry, reactivated revoked grants and re-emitted `created` | Idempotent: create, extend to the later expiry, or leave a revoked grant |
| N13 | Changing a space's access rule left rows that still acted | Requests only in by-request, invitations only in by-invite, rows ignored in all-members |

### Automations

| ID | Finding | Decision |
|---|---|---|
| M1 | Webhooks for `message.sent`, `message.deleted`, `message.reported` and `community.updated` failed on every delivery: `omit` on a strict schema rejected the omitted key | Every public schema strips; a catalog test parses a full row through every event |
| M2 | A request DM sent Message request and New message | New message skips a request |
| M3 | Lapsed or removed members kept receiving excerpts | Recipients filtered through entitlements |
| M4 | The inline engine forgot slots missed while down | On start it fires the latest missed slot within a day; run dedupe stops repeats |
| M5 | A Hatchet outage turned committed automation writes into 500s | Reconcile after commit, logged; periodic reconcile |
| M6 | Inline and Hatchet read day-of-month with day-of-week differently | Standard cron OR |
| M7 | Hourly schedules opened a run with nothing to do | Every timed action checks for work first |
| M8 | Concurrent seeding failed on the unique index | Insert on conflict do nothing |
| M9 | The 0005 dedupe kept both rows on a timestamp tie | Tie-break on id |
| M10 | The digest template lacks the spec's params | Open: the digest is silenced until the email-preference decision |

### Content

| ID | Finding | Decision |
|---|---|---|
| K1 | Topic edits failed (NUL temporary name) and ran outside a transaction | One transaction under the space lock; the name constraint is deferred to commit |
| K2 | Removing a referenced topic returned 500 | Conflict before anything is written |
| K3 | The staff space route checked the community in the transport | Core reads a space of the community |
| K4 | `space.updated` from a cascade had no actor | It carries the actor |
| K5 | The digest's published filter lived in the composition root | Content lists published community ids |
| K6 | Community created and deleted published DM settings | All three community events strip settings |

### Integration

| ID | Finding | Decision |
|---|---|---|
| X1 | The composition root's mail layer held rules (A1, D6) | A mapping only; each rule moved to its context |
| X2 | Message senders had no profile (P13) | Sender view from the shared author projection |
| X3 | The moderator rule was repeated as `isStaffRole(r) \|\| r === 'moderator'` | `canModerate` from the authorization matrix |
| X4 | The SDK did not export Communities, Posts, Chats and Profile | Exported |
| X5 | The import boundary lint listed internal files by name and missed the new ones | Any deep import into another context is refused |
| X6 | A member route imported the server package from inside the server | Relative import |
| X7 | Comments added on the branch (A7) | Removed |
| X8 | Stale docs: build state, ownership, route prefixes, event and migration lines | Corrected |
| X10 | OpenAPI, SDK and API docs | Regenerated; an orphaned API page removed |

## Fourth pass

Three reviewers verified the third-pass fixes against the code. Every item held, and they found the following, which were fixed:

| ID | Finding | Decision |
|---|---|---|
| Q1 | Blocking. `DELETE /api/students/:id` deleted any org user, admins included, for any staff role; resending a student invite skipped `manage_users` | Both require `manage_users`; the delete takes students only; a person who has written gets a 409, not a 500 |
| Q2 | The actor for the mirror event sat in a shared map and was misattributed under concurrency | An async-local scope around the Better Auth call |
| Q3 | Demoting a moderator was two Better Auth calls with no recovery | One call; the mirror keeps the person as a student in one transaction; a promotion that does not take effect is refused |
| R1 | A request started without a body never notified its message; concurrent creator sends both passed | A request needs its message; the creator cannot send while it is pending |
| R2 | The "until unmuted" wire value was year 275760, not RFC 3339; `until: null` meant 1970 | The mute shape above; explicit null refused |
| R3 | A blocked person could write into a DM the blocker had left | The pair is checked in a DM whether or not the other person left |
| R4 | New message decided "request" when the email was derived, not when the message was stored | `message.sent` carries `metadata.chatStatus` |
| G1 | 0006 carried old notices onto a renewed grant's term | Only current-term reminders carry over |
| G2 | A database that applied an earlier draft of 0003/0004 kept the placeholder resolver, the old check and old kinds | 0006 converges them |
| G3, G4 | The notice key lost microseconds; an expiry could race a renewal | One-statement claim (see N1) |
| G5 | The membership rule existed in TypeScript and SQL | SQL only |
| G6 | Remove worked in an all-members space | Refused |
| G7 | Home member counts disagreed with capacity | Same rule |
| G8 | Two expiry boundary copies remained | Shared predicate |
| G9 | `communityModeratorIds` had no test | Tested |
| G10 | `hasDue` loaded every due post | An exists query |
| T1–T9 | Assets: size check race at finalize, stray uploads after the ticket, orphaned copies, double finalize, dangling inline ids, the library check race, editor contract docs, the run record key, the cap validation | See `docs/assets-review.md` |

The fourth pass also found that the space-member subquery inside the batched access read compared unqualified columns. As a result, a person was never seen as active in a by-request or by-invite space. It is fixed, and a test pins the SQL.

Verification after the fourth pass:

| Check | Result |
|---|---|
| `pnpm typecheck` | passes, every package and both apps |
| `pnpm lint` | passes |
| `pnpm test` | 84 files, 944 tests, all pass |
| Migrations | 0000–0006 applied in Postgres 17 to an empty database; `drizzle-kit check` passes; the topic constraint is deferred and the first notice ledger is gone |
| Schema drift | `drizzle-kit generate` reports no changes |
| Contract | OpenAPI regenerated from the route schemas; SDK and API docs regenerated from it |

## Migrations carry schema only

No release holds data from before the feature, so every data statement left the migrations: the flag resolution backfill (B1), the asset source, kind and uploader conversion, the notice copies (G1), the system seed backfill for existing orgs (B3, E4), the fix-ups for databases that ran an earlier draft (G2), and the lesson media links. The last one read the Plate document shape in SQL, which no editor-neutral layer may do. The fixes those items name for the running code stand. An org gets its system automations when it is created.

## Open

These are not fixed. Each needs a decision or work outside this branch, and the next review run should pick them up.

| ID | Item | Why it is open |
|---|---|---|
| OP1 | An author cannot discard their own draft or scheduled post. P1 stops removal of unpublished posts so a restore cannot publish them, and the spec has no discard operation | Product decision: hard delete of an unpublished post by its author, or a removal that restore refuses to publish |
| OP2 | Unblocking a closed DM sets it to `open` (spec), so a request that was blocked opens without acceptance. The exploration says nothing can be sent until the recipient accepts | Needs the acceptance recorded on the chat (for example `accepted_at`) and the spec line changed; a spec decision |
| OP3 | M10: the digest template has none of the spec's params | Waits on the deferred email-preference decision, as the spec says |
| OP4 | No repository or migration test runs against a real Postgres in CI. SQL is pinned by capture tests against a fake client; the migrations were verified by hand in this review | Needs a Postgres test harness for `adapters/db` |
| OP5 | Two concurrent finalizes of one member upload with a re-upload in between can refuse the new bytes and delete the row the other just made ready | Narrow race; needs a row lock across finalize |
| OP6 | The deferred topic name constraint is not expressible in the Drizzle schema, so `db:push` builds a database without it | A Drizzle limitation; migrations are the supported path |

## Tracking

| ID | Title | Status |
|---|---|---|
| B1 | Migration aborts on resolved reports | completed (third pass: legacy resolver is null, not a placeholder id) |
| B2 | Asset ids unchecked at write time | completed |
| B3 | No seed backfill for existing orgs | withdrawn: migrations carry schema only |
| B4 | No member upload route | completed |
| S1 | Student cannot become moderator | completed in the third pass (O1, O4) |
| S2 | Message request blocks the wrong side | completed (third and fourth pass: C2, R1) |
| S3 | Moderation actions leave flags open | completed in the third pass (P2, P9, C9) |
| S4 | Lapsed member can still chat | completed in the third pass (C3) |
| S5 | `startDirect` drops the body | completed (third pass: C6) |
| S6 | Schedule loop and cron matcher | completed (third pass: M4–M6) |
| S7 | `editMessage` ignores lock | completed |
| S8 | `listSpaceMembers` leaks moderation state | completed |
| S9 | Digest for draft communities | completed (third pass: K5) |
| A1 | Read layer in composition root | completed in the third pass (X1) |
| A2 | Outbox as ledger | completed in the third and fourth pass (N1, N2, G1–G4) |
| A3 | `contentId` overloaded on `ending_soon` | completed |
| A4 | Optional deps with silent stubs | completed (third pass: F22) |
| A5 | Timer in core | completed |
| A6 | Space-open rule in SQL | completed (third pass: N6) |
| A7 | Comments in code | completed in the third pass (X7) |
| D1 | Four grant-covers implementations | completed in the third pass (N3, N4) |
| D2 | Hardcoded staff list in SQL | completed |
| D3 | `postComments` duplicates threading | completed |
| D4 | `visiblePost` duplicates `loadVisible` | completed |
| D5 | Double `getSpace` | completed in the third pass (N7) |
| D6 | N+1 in mail reads and `send` | completed in the third pass (X1, C5) |
| D7 | `recentRecipients` filters in JS | completed |
| D8 | `listSchedules` loads every automation | completed |
| D9 | Duplicate message-queue route | completed (third pass: orphaned API page removed) |
| D10 | `filterMatches` twice | completed |
| D11 | Unfiltered per-community seeds | completed |
| E1 | Leave DM dead end | completed |
| E2 | Restore always publishes | completed (third pass: P1) |
| E3 | Schedule from pending | completed |
| E4 | Seed duplicates on redelivery | completed in the third pass (M8, M9) |
| E5 | Topic rename swap | completed in the third pass (K1) |
| E6 | Decorative `:communityId` | completed (third pass: P7, K3) |
| E7 | Profile GET 404 | completed |
| E8 | Raw ISO date in email | completed |
| E9 | One missing email fails audience | completed |
| E10 | Minute cron writes runs and events | completed in the third pass (M7) |
| E11 | Settings delete placement vs spec | completed |
| T1 | Lint failure | completed |
| T2 | Test title inverted | completed |
| T3 | `CommentEvent` misnamed | completed |
| O1–O4 | Third pass, organizations | completed |
| C1–C11 | Third pass, chats | completed |
| P1–P13 | Third pass, posts and comments | completed |
| N1–N13 | Third pass, entitlements | completed |
| M1–M9 | Third pass, automations | completed |
| M10 | Digest template params | open (OP3) |
| K1–K6 | Third pass, content | completed |
| X1–X8, X10 | Third pass, integration | completed |
| X9 | DB-level tests | open (OP4) |
| Q1–Q3, R1–R4, G1–G10, T1–T9 | Fourth pass | completed |
| OP1–OP6 | Open items | open, for the next review run |
