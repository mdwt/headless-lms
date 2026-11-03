# Review: notifications and automations specs

Nov 2, 2026. Specs: `docs/notifications-spec.md` and `docs/automations-user-space-spec.md`; on Nov 3 the second was merged into the first (item 40), so references to the automations spec now point to sections 14 and 15 of `docs/notifications-spec.md`. Reviewed against the code at `81b4d67`; code references are `file:line` at that commit, spec references name sections.

Each item carries a status: `open`, `fixed` or `dropped`. Change the word on the item and add a note after it.

**Verdict:** the direction is right and fits the architecture. Product behaviour leaves automations, timed work becomes jobs on a generic scheduler, each context names recipients, automations runs delivery. The blocking items are resolved before implementation.

## Notifications spec

### Blocking

**1 · fixed · Dedupe key breaks multi-community occurrences**
Where: Data model › `notifications`; Catalog › Rules › 2; Delivering › Record.
Problem: unique on `(org_id, user_id, source_event_id, catalog)` with `catalog ∈ {org, community}`. One `entitlement.created` on a bundle holding two communities files `community.welcome` in two community catalogs for the same person, and the second insert collides. Today `welcomeToCommunity` sends one per community (`packages/core/src/automations/community-derivations.ts:61-88`).
Fix: add `coalesce(community_id, '')` to the key.
Applied: the unique key is `(org_id, user_id, source_event_id, coalesce(community_id, ''))`; rule 2 and the Record step say each community's catalog counts separately.

**2 · fixed · Retrying deliveries through the outbox couples channels to every subscriber, and gives up**
Where: Delivering › Execution; Use cases › 16.
Problem: `InMemoryEventBus.publish` awaits handlers in sequence with no try/catch (`adapters/defaults/src/events/index.ts:10-17`). A throw from identity's handler stops `automations.handle` for that event, so the org's workflows and webhooks wait on the email provider. The relay backs off from 5s to 15min and parks the event after `OUTBOX_MAX_ATTEMPTS = 10` (`adapters/db/src/repositories/outbox.ts:19`); after that the `failed` delivery row is never retried. Use case 16 is false as specified.
Fix: `notify` writes the notification and its `pending` deliveries in one transaction and never throws for a channel failure. A recurring job `identity.deliveries.retry` on the scheduler's `every` retries failed deliveries with its own backoff and cap.
Applied: Delivering › Execution and Retries; `notification_deliveries` gains `next_attempt_at` and a partial index; `identity.deliveries.retry` (every minute, one minute doubling to an hour, `failed` after a day) is in the automations spec's product jobs; use case 16 reworded.

**3 · fixed · Nobody renders email and push content, and identity can't**
Where: Channels; Delivering › Deliver; Digest.
Problem: occurrences carry ids only. The templates need `postTitle`, `commenterName`, `excerpt`, `spaceName`, `seatsLeft`, `participantNames` (`packages/core/src/types/email-templates.ts:37-109`), computed today by automations through `CommunityMailReads`, wired from six contexts (`packages/server/src/app/community-mail.ts`). "The email adapter" is `EmailSender`, a transport. There is no (type, reason) → template mapping (`comment.created` · `post_author` → `newCommentOnPost`, · `comment_author` → `replyToYourComment`), no template for `mention`, `*.reacted`, `course.activity_added`, and no named computer for the digest body (today the derivation is silenced, `community-derivations.ts:555`).
Fix, options: (a) the occurrence carries the display facts the producer already loaded and identity stores them on the notification; channels render from the row. (b) identity declares a `NotificationDescriber` port wired to `reporting/member.describeNotifications` (`packages/core/src/reporting/member/service.ts:106-135`). Either way the mapping and the missing templates must be specified.
Applied: option (a). Channels › Rendering: each type declares `display` keys, the producer fills them, identity validates and stores `display` on the row; a table maps every type to its display keys and email template, with the reason-picked variants and five new templates; push renders from the same `display`; in-app resolves at read. The digest body is the posts since the community's previous digest, in `display`.

**4 · fixed · Subscriptions in identity create a cycle; they are discussion's**
Where: Subscriptions; Producing; Delivering; Data model; Ports and adapters; HTTP API › Subscriptions; Ownership; Domain docs to update.
Problem: a follow or mute is a member's state on a discussion item (`docs/domain/discussion.md:190,198`). In identity, the write needed discussion and entitlements for the access check while discussion needed identity's `SubscriptionReader`. No two contexts import each other today.
Fix applied: subscriptions are discussion's, next to bookmarks, reactions and flags. Discussion applies mutes as the last step of naming recipients; identity never sees a follow or a mute. `SubscriptionReader` and the "Mutes" delivery step are removed. The `subscriptions` table moves to the discussion schema, keyed by `org_user_id`. The subscription endpoints are one call to discussion. The domain doc updates cover `discussion.md` and the identity ↔ discussion boundary. See 34.

**5 · fixed · Two more cycles: identity ↔ entitlements, content ↔ entitlements**
Where: HTTP API › Member settings (`spaces`, and the 422 for a space the member can't open); Types › Content.
Problem: identity needs entitlements for "spaces the member can open" while entitlements calls `NotificationDesk`. `course.activity_added` · `course_member` needs "who holds the course" inside content while entitlements imports content.
Fix: the settings view with `spaces` composes in `reporting/member`. Identity stores a space setting without an access check; a setting for a space the member can't open never matches. `course.activity_added` is produced by entitlements subscribing to `content.course.activity.published`, as `community.welcome` already is.
Applied: the member settings GET and PATCH response come from `reporting/member`; the 422 for an unopenable space is gone and identity stores space settings unchecked; `course.activity_added` is an entitlements type (Types intro states the rule), content no longer calls `NotificationDesk`.

**6 · fixed · `activities.status` default `draft` with no backfill hides every existing course**
Where: Data model › `activities`; Domain events › Course activities.
Problem: "members see only published activities" plus a default of `draft` blanks all released data; 0.3.0 is published.
Fix: backfill to `published`. State the progress denominator (published only, `docs/domain/progress.md`), gating, and the admin editor's publish control.
Applied: Data model and Domain events › Course activities: backfill to `published`, new activities `draft` unless the request says otherwise, drafts not served, not counted, not gated on; the event fires only on the transition in a published course; `status` on the activity POST and PATCH; a publish control in the admin editor.

**7 · fixed · `staff` drops instructors and over-reaches on messages**
Where: Types › Reasons.
Problem: the spec says "owner, admin or moderator". Today `moderationAudience` is `communityModeratorIds`, every role with `moderate`: owner, admin, instructor, moderator (`adapters/db/src/repositories/entitlements.ts:49,743`, `packages/core/src/organizations/roles.ts`). `message.flagged` goes to `staffOrgUserIds` (owner, admin, instructor) because only `isStaffRole` may open the message queue (`packages/core/src/discussion/chats.ts:650`); a moderator can't read what they would be told about.
Fix: two reasons, `moderator` (can moderate and is a community member) and `staff` (owner, admin, instructor), assigned per type.
Applied: Reasons table has both; `post.awaitingReview`, `content.flagged`, `space.join_requested` give `moderator` (today's `moderationAudience`, `community-derivations.ts:327,353,570,596`), `message.flagged` gives `staff` (`:614`); the default `review` category, the mute exemptions and the Producing reads follow.

**8 · fixed · Per-space defaults can't be expressed**
Where: Catalog › Shape.
Problem: `channels.default` is per category, so an Announcements space that notifies by default and a Practice space that doesn't can't coexist (`docs/community-spec.md:82`; row 14 in `hlms-community/docs/notification-categories.md`).
Fix, options: `spaceDefaults: { [spaceId]: channels }` on a space category; or a space setting in content read through a port.
Applied: `spaceDefaults` on space categories. The catalog is already the community's and is validated and replaced as a whole, and resolution stays in identity with no new port. Resolution gains step 4 (`spaceDefault` source), validation rejects it on community categories or for unoffered channels, space ids aren't validated (an unknown one never matches); use case 3 and the requirements table updated.

### Gaps

**9 · fixed · `scope` is single-valued**
Where: Ports and adapters › `NotificationTypeDeclaration`; Catalog › Rules › 6.
`mention` is "space or chat" and rule 6 depends on it. Fix: `scopes: Scope[]`, or scope on the occurrence.
Applied (Nov 3): a type declares `scopes`, one or more of `org`, `community`, `space`, `chat`.

**10 · fixed · Reactions have no throttle**
Where: Types › Discussion.
N likes produce N notifications. `setReaction` replaces (`packages/core/src/discussion/chats.ts:420`); whether a changed emoji is "added" is unspecified. Fix: declare `throttle: { per: 'post' }` for `*.reacted` and state the replace semantics.
Applied (Nov 3): reaction types are throttled to once per item per person per hour; only a person's first reaction emits `*.reaction.added`, and changing or removing it emits nothing.

**11 · fixed · The `message.sent` throttle has no index**
Where: Data model › `notifications`.
Fix: index on `(org_id, user_id, type, chat_id, created_at)`.
Applied (Nov 3): throttles key on the subject or the parent; index `(org_id, user_id, type, parent_type, parent_id, created_at)`; `message.sent` throttles per chat.

**12 · fixed · Fan-out before the settings filter**
Where: Producing; Default community catalog.
`space_member` builds every opener of the space per event, then settings drop nearly all of them (`new_posts` defaults off). Fix: for default-off space categories start from opted-in ∩ can-open, and say where that read lives.
Applied (Nov 3): a rule for a default-off category starts from the people who switched it on (`NotificationReads.switchedOn`), intersected with space access.

**13 · fixed · Course-activity comments are unspecified**
Where: Types › Discussion.
`discussion.comment.created` with `activityId` and no post falls outside the space-scoped `comment.created` and `content.flagged`. Fix: state they notify nobody, or add org-scoped types.
Applied (Nov 3): any content that emits events can notify. Comment, mention, removal, reaction and report types allow scope `org` for items outside a community; the org's default list covers them; scenario 18.17.

**14 · fixed · Digest "come due" needs a ledger**
Where: Digest › Trigger.
An hourly job can't tell due from already sent across restarts. Fix: a last-opened ledger per community, like entitlements' notice ledger (`packages/core/src/entitlements/service.ts:496-590`).
Applied (Nov 3): discussion's `digest_runs` ledger, updated in the transaction that appends `discussion.digest.due`.

**15 · fixed · The row keeps reasons for the matched type only**
Where: Delivering › Record; Notification list.
Sarah filed under `mentions` loses `comment_author`, so the Threads tab misses it. Fix: store all pairs, or document the loss.
Applied (Nov 3): `reasons` stores every reason the person has for the event, so reason filters find the notification under any category.

**16 · fixed · Type keys aren't namespaced**
Where: Types.
`post.published` is a type and `discussion.post.published` an event. Fix: the registry rejects duplicate keys across contexts.
Applied (Nov 3): the composition root refuses to start on a duplicate type key.

**17 · fixed · `notify` throws on an unregistered type**
Where: Ports and adapters.
A programming error would retry 10 times through the outbox. Fix: log and drop.
Applied: automations logs and drops a recipient list with an unregistered type (section 15).

**18 · fixed · `devices` keyed by `org_id`**
Where: Data model › `devices`.
One install registers once per org; the profile precedent is per person (`docs/domain/identity.md:16`). State the choice.
Applied (Nov 3): devices are org-scoped like every record; the session's org decides it, and an install signed in to two orgs registers once in each (section 10).

**19 · fixed · Migration is "dropped", not specified**
Where: Data model › Dropped.
`notifications.kind` data (0.3.0 released), `post_follows` and `chat_users.muted` are dropped. Fix: specify the kind → (type, reasons, category) backfill or a truncation, and copy follows and mutes into discussion's `subscriptions`.
Applied: section 14 Migration specifies the backfill and the copy into `subscriptions`.

**20 · fixed · The list example loses fields the view carries today**
Where: HTTP API › Notifications.
`community`, `space` and `actor.imageUrl` are on `NotificationView` (`packages/core/src/reporting/member/model.ts:97-109`).
Applied (Nov 3): the list example carries `community`, `space` and `actor.imageUrl`.

**21 · fixed · `course.activity_added` is org-scoped**
Where: Types › Entitlements.
No course scope, so no per-course setting and no `courseId` filter. Say so.
Applied: section 5.2 states it.

## Automations spec

### Blocking

**22 · fixed · `wait` doesn't exist**
Where: Use cases › 1; Actions.
Use case 1 and "drip sequences" need it. `packages/core/src/automations/actions.ts` has no wait, and the actions table lists sendEmail, grantAccess, deliverWebhook. Fix: add `wait` (Hatchet: durable sleep; inline: `scheduleAt` the remainder), or drop the use case.
Applied: `wait` with an ISO 8601 duration. A wait is a scheduled job on every engine: `runAction` returns `waiting` with `until`, automations schedules `automations.run.resume` keyed by run id, and dispatches the run again from `fromIndex`. The run stays `running`; `finalize` runs once.

**23 · fixed · The inline engine is the default and is unspecified**
Where: Scheduler; Engines.
The scaffold passes no workflows adapter (`packages/create-headless-lms/templates/src/main.ts`), so installs run `InlineAutomationEngine`. A timer-backed `scheduleAt` dies on restart with its `engine_ref`, and scheduled posts never publish. Fix: re-arm `scheduled_jobs` rows on start; the inline cron loop takes `syncCrons`' list instead of `listSchedules`.
Applied: `start(pending)` on the engine port; an Inline table beside Hatchet's (in-memory crons on the minute loop, timers with generated refs, re-armed under their refs on start, three attempts a minute apart); Hatchet ignores the pending rows.
Superseded (Nov 3): the inline engine is for development; it re-arms nothing on restart. Deployments run Hatchet.

**24 · fixed · `syncCrons` can't carry an org schedule's input**
Where: `AutomationEngine`; Executor.
Today's Hatchet cron carries `{ orgId, automationId }` and fires `fireSchedule` (`adapters/workflow-hatchet/src/index.ts:209-213,231-236`). The spec drops `fireSchedule` with no replacement, so org `schedule:` triggers can't fire. Fix: `input: ScheduledJobInput` per cron; org schedules become a job automations handles itself.
Applied: `syncCrons` takes `input` per cron; product jobs carry `{ job, key: null, payload: null }`, org schedules are `hlms-schedule:{orgId}:{automationId}` with `automations.schedule.fire` and `{ orgId, automationId }`; `fireSchedule` is removed and listed as such.

### Gaps

**25 · fixed · Where `Scheduler` lives**
Where: Ports.
The spec puts a context's inbound port in `shared/ports`, which holds ports adapters implement (`docs/project-structure.md:91-96`), and makes discussion depend on automations for something automations "knows nothing about". Options, by merit: (a) `JobScheduler` is a deployment port in `shared/ports` implemented by the workflow adapter (Hatchet and inline each implement it beside `AutomationEngine`; keyed replace inside the adapter), and automations consumes it like any context, so `docs/domain/automations.md:10` stays true. (b) As specified, exported from automations' index, with discussion declaring a narrow `PostScheduler { at, cancel }` port (`docs/architecture.md:34` pattern).
Applied (Nov 3): option (a). `Scheduler` is a deployment port in `shared/ports`, implemented by the workflow adapter beside `AutomationEngine`; the keyed replace lives in the adapter; automations uses it like any context. `syncSchedules`, `listSchedules` and `fireSchedule` go; org schedules are keyed `every` jobs.
Revised (Nov 3): the scheduler stores nothing; the Hatchet adapter keys one-off runs by run metadata and crons by name (item 39).

**26 · fixed · `scheduled_jobs` has no `org_id`**
Every org-scoped row is keyed by it (`docs/domain/organizations.md:81`).
Applied (Nov 3): `scheduled_jobs` has `org_id`, null for product jobs; it is infrastructure like `event_outbox`.
Superseded (Nov 3): there is no `scheduled_jobs` table (item 39).

**27 · fixed · `reschedule` returning false**
Already fired: automations must `scheduleAt` anew; the fired handler stopped on a future `scheduled_at`. Hatchet 1.28 `ScheduleClient.update(id, { triggerAt })` exists.
Applied: a moved job whose run already fired is scheduled anew.

**28 · fixed · Row deleted before the handler runs**
On a retry there is no row, a concurrent `at` schedules a second run, and `cancel` can't reach the retrying one. State that the handler's re-check covers it, or delete after success.
Applied (Nov 3): a one-off row is deleted only after its handler succeeds.
Superseded (Nov 3): there are no rows; the handler re-checks the owner's state (item 39).

**29 · fixed · Product jobs lose run history**
Failures of expiry and the sweep are logs only. State it.
Applied (Nov 3): stated; product jobs log failures and have no run record.
Revised (Nov 3): Hatchet keeps the run history of product jobs.

**30 · fixed · "Catalog actions lose their `source`"**
Integration actions carry `source: integration.id` (`packages/core/src/automations/service.ts:883`). Drop only the `'system'` value.
Applied (Nov 3): catalog actions keep `source`; only the `'system'` value goes.

**31 · fixed · Org-authored `sendEmail` is unspecified**
Body format, subject placeholders, escaping, which public-data fields, branding via `TemplateContext`.
Applied (Nov 3): subject placeholders, HTML-escaped values, a plain-text body in the deployment's layout, branding from `TemplateContext`.

**32 · fixed · `every` jobs are global but the work is per org**
`expireDue`, `removeUnattached` and `sendDigest` take an `orgId`. Each needs an all-orgs entry point that pages orgs.
Applied: recurring handlers work across all orgs.

**33 · fixed · The removal list is incomplete**
Missing: `AutomationRunsRepository.recentRecipients`, `packages/server/src/app/community-mail.ts`, `MailerLookups.contentInfo`, `AutomationSource`, `ScheduledAutomation`, `listSchedules` and `fireSchedule` on the executor, `ActionDeps.desk`, `.scheduledWork`, `.mail`.
Applied (Nov 3): the removal list adds the listed items.

## Architecture docs

**34 · fixed · No ownership rule**
Problem: `docs/architecture.md` had no rule for which context owns a record. `docs/domain/identity.md:22` ("belongs to the person, like their profile") was read as the rule and put follows and mutes in identity, against `docs/domain/discussion.md:190,198`.
Fix applied: an "Ownership" section under Core Server in `docs/architecture.md`: the owner is decided by what the record is about; a person's own records are identity's; a person's state about another context's item belongs to that context; a record keyed by another context's item, or read only by another context, is misplaced.

**35 · fixed · Both specs undercount the docs to update**
- `docs/domain/discussion.md`: "edits are neither versioned nor evented" and "reactions ... not evented" become false; new events; the mentions entity.
- `docs/domain/content.md`: activity `status` and the first publish event (`docs/community-spec.md:779` says none exists).
- `docs/domain/assets.md` boundary 6: the sweep is a job, not a system automation.
- `docs/domain/automations.md`: more than the three edits listed; the running-state paragraph, "Fire a schedule", "idle schedule leaves no run".
- `docs/community-spec.md` Automations and Emails sections describe the seeded model throughout ("Every email is sent by the `sendEmail` action of an automation"); mark superseded.
- `docs/architecture.md` adapters table and `docs/project-structure.md`: `adapter-push`, notification channels.
Applied (Nov 3): both specs list the discussion, content, assets, automations, community-spec, architecture and project-structure changes.

**36 · fixed · Ownership of the notification process**
Problem: the specs put the notification process (type registry, catalogs, matching, storage, delivery, retries) in identity. Identity is the person and the account; a delivery pipeline is not the person's record. A new bounded context was proposed and rejected.
Fix applied (Nov 2 2026): the automations context runs the process in code, as a system feature no org can edit. It listens to every event, asks the context that owns the event who should hear and why, applies the notification categories (content for a community, organizations for the org) and the person's settings (identity), stores `notifications` and `notification_deliveries`, sends, and retries with `automations.notifications.retry`. Identity keeps settings and devices. "Catalog" is renamed to notification categories; "occurrence" to recipient list. Applied notes above that say identity (items 2, 3, 5, 8) now read automations, and `identity.deliveries.retry` is `automations.notifications.retry`. `docs/architecture.md` Ownership says a record of something the system did belongs to the context that did it.
Later the same day: the subject id columns on `notifications` became one typed reference (`subject_type`, `subject_id`, `parent_type`, `parent_id`), and `notification_deliveries` was folded into `notifications.deliveries` (jsonb, one entry per channel) with `next_attempt_at` on the row; items 2 and 11 read accordingly.

**37 · fixed · Recipient rules, delivery records and retries**
Problem: the spec had each source context answer who hears about its events, kept per-channel delivery state in a jsonb column, and retried failed channels with a job that polled `notifications` every minute.
Fix applied (Nov 3 2026): recipient rules are automations' code, one per event, reading the owning contexts through `NotificationReads` (today's `CommunityMailReads`, extended). `notifications.deliveries` and `next_attempt_at` are replaced by `notification_deliveries`, one row per notification per adapter channel; the `notifications` row is the in-app notification, with `in_app`. Each delivery runs as an `AutomationEngine` task; Hatchet retries it (`retries: 3`), the inline engine runs it once. `automations.notifications.retry` is removed. Items 2 and 36 are superseded where they say otherwise.

**38 · fixed · Review of Nov 3: ownership, devices, implementation detail**
Fix applied (Nov 3 2026): devices are specified for native apps and browsers (section 10): provider `apns`, `fcm` or `webpush`, token, Web Push keys, app id, APNs environment, last seen; sent directly to APNs, FCM and Web Push; devices not seen for 30 days are skipped; dead tokens are reported by the push adapter and deleted by identity, not by the adapter. Category list changes no longer write identity's settings; resolution ignores settings outside the list in use. Type declarations and default lists are automations' code behind `NotificationTypeRegistry`. Section 3.4 lists code locations. `NotificationReads`, `NotificationChannel` and `DeliveryResult` are specified; adapters throw only for retryable failures. Deliveries are claimed (`sending`, `claimed_at`) so two tasks never send one delivery at once. The read routes call `NotificationsService` in automations. `content.course.activity.published` is listed under content.


**39 · fixed · `scheduled_jobs` duplicated Hatchet**
Problem: the spec kept every scheduled job in a `scheduled_jobs` table behind a `ScheduledJobStore` port, to map keys to engine refs and to re-arm the inline engine on restart. Hatchet already stores scheduled runs and crons, finds runs by metadata, moves and deletes them, retries and keeps history; the table duplicated it, as the retry job did for deliveries.
Fix applied (Nov 3 2026): `scheduled_jobs` and `ScheduledJobStore` are removed. The Hatchet adapter keys one-off runs by metadata `job` and `key` and crons by name `hlms-job:{job}:{key}`. The state of a scheduled thing stays with its owner: a scheduled post in `posts` (`status`, `scheduled_at`), an org schedule on its automation, a paused run in `automation_runs`; listing, moving and cancelling work on that state, and the handler re-checks it when the timer fires. The inline engine is for development and loses timers on restart.

**40 · fixed · One spec**
Problem: the automations spec existed only so notifications could become a system process; its notification half duplicated the notifications spec and its title described the opposite of its purpose.
Fix applied (Nov 3 2026): merged into `docs/notifications-spec.md`. Section 14, Scheduled jobs, holds the scheduler port, state and timers, the Hatchet adapter and the product jobs. Section 15, Changes to automations, holds the removed seeds, the actions (`sendEmail`, `wait`), the data model, the migration and the HTTP API. Scenarios 20.18–20.21, the code removed (section 22), the domain docs (section 23) and the seeded automations today (24.4) came across. `docs/automations-user-space-spec.md` is deleted.

**41 · fixed · Implementation-readiness review, Nov 3**
Two reviews found 31 issues. Applied:
- Scheduler: `register` and `start` on the port; contexts export handlers and product jobs; `adapters.workflows` is `AutomationEngine & Scheduler`; the entry point starts the scheduler and calls `armSchedules()`; unknown jobs are dropped; delivery is at least once with a stable `fire.id`.
- Hatchet calls corrected: crons found by name with `crons.list` and deleted by id, keep-or-replace; scheduled runs listed with `statuses: [SCHEDULED]`; cancel with `bulkDelete` by metadata.
- Org schedules keyed per trigger, `{automationId}:{cron}`, with add/remove diffing.
- `wait` sleeps inside the durable `automation-run` (`ctx.sleepUntil`), checks `canContinue`, and ends `cancelled` when the automation is gone; `automations.run.resume` and `fromIndex` are removed.
- Scheduled posts call `at` before committing; the handler re-arms a post whose time moved later; migration backfills existing scheduled posts and deletes the legacy `hlms-schedule:` crons.
- Migration keeps disabled seeds as stored category lists, deletes system rows' runs, and disables org rows with removed actions (`needsEdit`).
- `sendEmail` renders through a new `custom` template; `{{name}}` from `MailerLookups.orgUserPerson`; `{{data.path}}` grammar; built-in actions keep `source: 'system'`.
- Cross-org jobs read orgs through `OrgDirectory` and digest schedules through `DigestScheduleReader`; no `digest` key means no digest; `discussion.digest.due` carries `{ communityId, from, to }`; owners set `digest` on the community settings route.
- New-post fan-out moved to the processor through audience lists; community lists cover `chat` types; `NotificationReads` gains `contentInfo`, `message`, `postsPublished`, `threadParticipants(item)`; `download` subject type.
- Course-activity comments: display keys and templates per scope; comment reaction event carries `activityId`.
- Settings PATCH validated by identity through a `NotificationCategoryReader` port wired in composition.
- Shared types defined in `core/types/notifications.ts` (`StoredNotification`, `PushDevice`, `NotificationCategory`).
- Delivery claim lease replaced by a Hatchet concurrency key on `deliveryId`.
- Chat mutes come only from `subscriptions`; `discussion.post.created` produces `post.awaiting_review` only; staff can open everything; email template and variant named by the type declaration, selected by `matched_reason`; `mentionedOrgUserIds` added to event data, not public data; the `organizations` settings namespace is new; scenarios 20.3 and 20.5 corrected; `course.activity_added` listed under content.

**42 · fixed · Org automations are out of scope**
Problem: the spec carried changes to org-authored automations that notifications don't need: a new `wait` action (with `canContinue` and a `cancelled` run status), a rewritten `sendEmail` with a `custom` template and placeholders, org `schedule:` triggers moved onto the scheduler, and a `needsEdit` migration for org rows. They came from the old automations spec's use cases, not from the notification work.
Fix applied (Nov 3 2026): removed. Org workflows, webhooks, actions (including `sendEmail` and its templates), schedules and runs are unchanged. The scheduler runs product jobs only; org schedules stay on `syncSchedules`/`fireSchedule`, and the existing `reconcile` removes the deleted seeds' crons. Only the five seed-only actions leave the catalog. Items 22 and 31 are superseded; item 25 holds for product jobs.

**43 · fixed · No seeding, no data migration**
Problem: the spec still read as if seeding were part of the design, and carried data-migration steps: carrying disabled seeds into category lists, deleting system rows' runs, mapping old notification kinds, copying follows and mutes, backfilling activities and scheduled posts.
Fix applied (Nov 3 2026): the overview and section 15 say nothing is seeded and the seeding code is deleted; seeding appears only as today's state (24.4) and code removed (22). All data migration is removed: section 16.11 creates, changes and drops schema only, and states that no data is migrated. Items 19 and 41's migration points are superseded.

**44 · fixed · Merged-spec review, Nov 3**
Two reviews of the merged spec. Findings that only concerned existing data were dropped (item 43). Applied:
- Activities: no `status` column; publishing uses the existing `settings.published` flag and its admin control, and content emits `content.course.activity.published` when it turns true in a published course.
- `discussion.post.updated` produces `post.awaiting_review` when a post moves into review.
- Audience lists carry `exclude` (the author), and the processor removes members who muted the space.
- Lists, stored notifications and the `notifications` table carry `scope`.
- Push title and body are declared per type and scope; the adapter receives `{ title, body, data }`.
- Reporting reads notifications through `NotificationsService.list` and `unreadCounts`, and titles through discussion's and content's `ItemTitles`.
- Publish events carry every mention; edits of published items only the new ones; draft edits none.
- Several lists for one person in one category: the first returned wins; `community.membership_ended` is one list with `communityTitles`.
- Invitees and declined requesters get `subject` notifications without access.
- `NotificationSettingsService` gains `getMany` and `switchedOn`; `comment()` gains `activityId` and `parentId`.
- `notification_deliveries.attempts` dropped; Hatchet keeps attempt history.
- Scheduler: `registerJobs` only; one adapter object implements both ports with one `start()`; product crons reconciled by name; delivery concurrency uses `GROUP_ROUND_ROBIN`; scheduled posts commit then call `at`, reverting on failure; the template starts the outbox relay and the engine.
- Removed action types are rejected on create and update; `discussion.digest.due` is version 2 with new public data; `NotificationReads` extends `CommunityMailReads`; the grant job emits events and changes no rows; 17 community `notify` seeds; domain-doc and code-removed lists completed.

**45 · fixed · Merged-spec review 2, Nov 3**
Two reviews found 12 blocking issues and 26 gaps. Applied:
- Recipient conditions: a `pending` comment produces nothing and carries no mentions; today's conditions per event (chat pending, left participants, blocked pairs, `previousStatus` checks, `role = moderator`) are a column in 11.1.
- Processing order: audiences are expanded before each person's pairs are collected; throttles run after expansion; dispatch sends every `pending` delivery of the event.
- Push renders in the composition root's push channel over a `PushSender` port; partial success is `sent`; no device or address fails without retry; `GET /api/member/push-config` serves the VAPID key; APNs bundle ids are configured and checked on registration.
- Channels resolve their own recipient (`NotificationChannel.recipient`); a deployment adds channels through `adapters.notificationChannels`; `ChannelRegistry.list()` includes `inApp`.
- `ItemTitles.titlesFor` takes the actor and returns only what the actor can open; deleted or closed references are `null`.
- Member settings PATCH: identity checks access through `CommunityAccessReader` (entitlements) and answers 204; staff count as members of every community and space.
- Activities: `content.course.activity.published` uses the `published !== false` test before and after, and on create; the admin sends `published: false` on create.
- Ports and signatures: `NotificationCategories`, `NotificationsRepository`, `NotificationsService`, `NotificationSettingsService`, `DevicesService`, `ItemTitles`, `NotificationCategoryService`, `StoredSetting`, `NotificationFilter`; `resolveChannels` in `shared`.
- `handle` runs org automations first and rethrows processor failures; `automation_runs` dedupe prevents a second org run on redelivery.
- Scheduled posts: `PostService.unschedule` and `POST /api/member/posts/:postId/unschedule`; commit then `at`, with a defined revert; 20.18 matches 14.2.
- Digest: per-member filtering by openable spaces; no row or a slot older than an hour moves the ledger without emitting; no posts, no digest; conditional upsert on `digest_runs`.
- Idempotency through conditional writes in the owner's table; `fire.id` for logs; `scheduled-job` concurrency per key; crons keyed by job; `start` creates the worker before reconciling.
- Mentions: every publish path fills `mentionedOrgUserIds`; rows are upserted, not replaced; course mentions keep people who can open the course.
- Database: foreign keys and on-delete per table; `notification_settings` primary key; indexes for redelivery and `switchedOn`; `automations` and `chat_users` listed as changed.
- Events: `publicData` for the new events, which join the trigger catalog; `discussion.digest.due` v2 stated as the one exception to requirement 19.
- `membershipEnded` params changed to `communities`; activity templates get `courseId`; list items carry `scope` and `display`; `scope` filter defined on `community_id`; discovery returns `scopes[]`; category list `DELETE` writes `null`.
- Grant notices per grant per published community; automations no longer listed as a job owner; code-removed and domain-doc lists completed.

**46 · fixed · Decisions for the owner**
- First match lets a switched-off category silence another: Sarah switches `mentions` off, and a comment on her post that mentions her reaches her nowhere, although `comments_on_my_posts` is on. Keep, or file under the first matching category with a channel on.
- Throttle across categories: a first chat message that mentions Sarah is filed as `mention`, so the second message finds no `message.sent` row and notifies again within 15 minutes. Count `mention` rows for the same chat toward the `message.sent` throttle, or not.
- Org `replies_to_my_comments` covers `thread_participant` with email on, so everyone who commented on a lesson gets an email for every later comment. Keep, or move `thread_participant` to an org category with email off.
Decided (Nov 3 2026), from how Discourse, Slack, Skool and GitHub behave:
- A person is filed under the first matching category with a channel on; a category switched off on every channel is passed over (Discourse's post alerter falls through to the next reason when the first isn't sent). 7.2 rule 1 and 11.2 step 5.
- Chat messages are debounced, not throttled: one scheduled flush per person per chat, moved by each new message, sends one notification after 2 quiet minutes, or nothing if the person read the chat (`unreadInChat`, from `chat_users.last_read_message_id`). A mention notifies at once and cancels the pending flush. Reactions are not debounced. Every throttle (`throttle` on type declarations, `recentForThrottle`, `latestFor`, the throttle indexes) is removed. Requirement 8, 11.2 step 3, 11.3, 14.4, 17, 20.8.
- `thread_participant` moves from the org's `replies_to_my_comments` to a new org category `followed_threads`: in-app and push on, email off, as the community's `followed_posts` (Discourse sets a replied topic to Tracking; Skool emails a daily summary). 7.5.
