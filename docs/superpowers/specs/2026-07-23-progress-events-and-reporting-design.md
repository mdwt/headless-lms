# Progress reporting, completion decisions & progress events

The student frontend can only **report** what happened — an activity was opened,
the player is at a position, the learner claims they're done. It never decides
completion. The progress service processes each report, applies the activity's
completion rule, records progress in its own data models (activity, module, and
course records), and emits `progress.started` / `progress.completed` domain
events through the outbox. Module and course completion are part of the same
evaluate-and-record decision — recorded inline, in the same transaction, never by
a downstream event handler.

## 1. Event types (`packages/types/src/progress.ts`)

`ProgressEvent` stops being `never`:

```ts
export interface ProgressStarted extends DomainEvent {
  type: "progress.started";
  orgId: string;
  /** The course whose structure the target belongs to. */
  courseId: string;
  record: ProgressRecord;
}

export interface ProgressCompleted extends DomainEvent {
  type: "progress.completed";
  orgId: string;
  courseId: string;
  record: ProgressRecord;
}

export type ProgressEvent = ProgressStarted | ProgressCompleted;
```

- `courseId` rides on the **event**, not the record — the schema is unchanged.
- Events carry the record snapshot, matching how identity events carry the
  student.
- Emission points: a record's first insert → `progress.started`; a record's
  completion → `progress.completed`. Module/course records are created already
  complete, so they emit only `progress.completed` (matches the domain doc:
  container completions cascade as `progress.completed`; only real "began a
  target" facts emit `progress.started`).

## 2. Target type rename: `lesson`/`assessment` → `activity`

Content models a uniform `Activity` — lesson vs assessment lives inside the
opaque settings blob, so no caller can honestly distinguish them.

```ts
export type ProgressTargetType = "activity" | "module" | "course";
```

Drizzle's `text({ enum })` is type-level only — no SQL change; update the enum in
`adapters/db/schema/progress.ts` and the baseline snapshot via `pnpm db:generate`
if drizzle-kit wants the metadata refreshed. The domain doc keeps talking about
lessons and assessments (kinds of activity); no doc change.

## 3. Report input & the reworked inbound port (`core/progress`)

A report is usage parameters about one activity, in one course, by one student
— no verb vocabulary. The wire format is the domain's own; foreign dialects
(xAPI statements, SCORM cmi calls) are translated to it at the boundary later,
the same way every other external dialect in this system stays in an adapter.

- `{}` — bare touch: the student is on the activity; first report creates the
  record (`startedAt`)
- `{ position }` — where the player is (opaque payload)
- `{ completed: true }` — the learner/player *asserts* completion — a claim the
  service validates, never a fact it accepts

Student comes from the session; activity and course come from the URL — never
from the body.

Per type ownership, the report/input types are declared in
`@headless-lms/types` (`progress.ts`) and re-exported by the context's
`types.ts`:

```ts
export interface ProgressReport {
  position?: unknown;
  completed?: boolean;
}

export interface ReportProgressInput {
  studentId: string;
  courseId: string;
  activityId: string;
  report: ProgressReport;
}
```

`ProgressService` gains the report capability and keeps its reads:

```ts
export interface ProgressService {
  /** Process a report: ensure the record, apply position, evaluate completion
   *  (activity rule, then module/course against current structure), emit events. */
  report(orgId: string, input: ReportProgressInput): Promise<ProgressRecord>;
  get(orgId: string, target: ProgressTarget): Promise<ProgressRecord | null>;
  /** Records for a set of target ids — the read the reporting layer composes. */
  listByTargets(orgId: string, studentId: string, targetIds: string[]): Promise<ProgressRecord[]>;
}
```

`recordStart` / `recordPosition` / `recordCompletion` fold into `report` — no
caller outside the service decides which lifecycle step applies. `report`
returns the activity's record after the decision.

### Processing a report

All writes of one report run in **one UoW transaction** (`ProgressUnitOfWork`,
scope `{ progress, outbox }`, same pattern as `IdentityUnitOfWork`; absent →
passthrough, no events, so existing service tests keep working):

1. **Ensure the record** — first touch inserts it (`startedAt` now) and appends
   `progress.started`.
2. **Apply position** — reports carrying `position` update the payload (stored
   opaque). No event.
3. **Evaluate completion** — the service reads the activity via
   `ContentService` (core→core through `content/index.js`) and interprets the
   completion-rule slice of the settings blob. Today the only interpretation is
   *no rule → manual*: a `completed` claim completes the activity. A
   present-but-unmet rule means the claim records nothing — the activity stays
   in progress.
   The rule seam is a private function of the service (settings → rule →
   satisfied?), which is where video-threshold and friends plug in later without
   touching the port or the endpoint.
4. **Record the decision** — completion sets `completedAt` and appends
   `progress.completed`.
5. **Module & course** — after an activity completes, the service evaluates the
   containing module and the course against **current structure**
   (`ContentService.listForCourse`) and the student's records for those activity
   ids (tx-bound repo). Newly-complete containers get their records inserted
   (complete on creation) and `progress.completed` appended — same transaction.

Idempotent throughout: reports against a completed activity, or re-evaluation of
an already-complete container, change nothing and emit nothing.

### Repository additions (`adapters/db/repositories/progress.ts`)

- `findByTargets(orgId, studentId, targetIds)` — the sibling-records read for
  container evaluation and for `listByTargets`.
- Repo must be constructible on a transaction handle (mirror the repos already
  used inside `DrizzleUnitOfWork` scopes).

## 4. API contract (`packages/api-contract/src/learn.ts`)

```ts
export const ProgressReport = z.object({
  position: z.unknown().optional(),
  completed: z.boolean().optional(),
});

export const ActivityProgress = z.object({
  status: z.enum(["in-progress", "completed"]),
});

export const CourseProgress = z.object({
  /** Keyed by activity id; absent key = not started. */
  activities: z.record(z.string(), z.enum(["in-progress", "completed"])),
  /** Integer 0–100, completed ÷ current activities, rounded. */
  percent: z.int().min(0).max(100),
  completed: z.boolean(),
});
```

### Report → effect

| report               | Effect |
| -------------------- | ------ |
| `{}`                 | Ensure the record exists (start). |
| `{ position }`       | Ensure record; store `position` as the opaque payload; evaluate the rule against it. |
| `{ completed: true }`| Ensure record; completion claim — service evaluates the rule and records completion iff satisfied (no rule = satisfied). |

### Wire examples

```http
POST /api/learn/courses/crs_9f2/activities/act_31c/progress
{}
→ 200 { "status": "in-progress" }

POST /api/learn/courses/crs_9f2/activities/act_31c/progress
{ "position": { "seconds": 612 } }
→ 200 { "status": "in-progress" }

POST /api/learn/courses/crs_9f2/activities/act_31c/progress
{ "completed": true }
→ 200 { "status": "completed" }        // or "in-progress" when a rule is unmet

GET /api/learn/courses/crs_9f2/progress
→ 200 { "activities": { "act_31c": "completed", "act_58a": "in-progress" },
        "percent": 50, "completed": false }
```

## 5. HTTP routes (`http/routes/learn.ts`, tag `Learn`)

Both session-guarded via `resolveStudentScope`, like every Learn route.

- `POST /api/learn/courses/:courseId/activities/:activityId/progress` — body
  `ProgressReport`, response `200 ActivityProgress`. Always 200 when processed:
  a `completed` claim with an unmet rule returns `status: "in-progress"` — that
  *is* the answer. 4xx only for transport-level problems (bad body, no session,
  unknown activity → 404). Future xAPI or SCORM support is a boundary
  translation onto this same endpoint (a shim maps statements/cmi calls to
  reports, `suspend_data` rides as the position payload) — no endpoint changes.
- `GET /api/learn/courses/:courseId/progress` — response `200 CourseProgress`.

The stub `http/routes/progress.ts` stays a stub — the student surface is Learn.

## 6. Reporting view (`reporting/learn`)

`LearnService` (reporting) gains `courseProgress(orgId, studentId, courseId)`:
compose `ContentService.listForCourse` (the denominator — current structure) with
`ProgressService.listByTargets`, derive the status map, `percent`
(completed ÷ current activities), and `completed` (the course target's record).
Percent is derived on read, never stored — structure edits shift it on the next
read with no backfill.

## 7. Wiring (`app/container.ts`)

- `progressUow = new DrizzleUnitOfWork(db, (tx) => ({ progress: new DrizzleProgressRepository(tx, …), outbox: new DrizzleOutboxAppender(tx, …) }))`
  — mirrors the integrations wiring.
- `ProgressServiceImpl(repo, content, progressUow, now, logger)` — content is the
  structure/rule read dependency.
- No EventBus subscriber. The outbox relay publishing committed progress events
  to the bus is the whole "processing" pipeline until a consumer (automations)
  exists.

## 8. SDK

`pnpm gen:sdk` — new `Learn.reportActivityProgress` / `Learn.getCourseProgress`
appear from the route schemas. Regenerated output is committed.

## 9. Student app (`apps/student`)

- **Hydrate**: the course player's server component fetches `CourseProgress` and
  seeds the store's `completionByCourse` (the shapes now match: a status map).
- **Report**: `toggleComplete` becomes one-way `markComplete` — sends
  `{ completed: true }`, applies the returned `status` to the store. The
  button's completed state is terminal (the domain has no un-complete).
  Course-complete toast keeps deriving from the local map; the GET is the
  authoritative refresh.
- **Open**: entering an activity sends a bare `{}` report (fire-and-forget)
  so `progress.started` reflects reality, not just completions.
- `position` reports are wired when a player that produces positions
  exists; the contract already accepts them.

## 10. Worked examples

Three lesson shapes end to end. Only the `manual` rule ships in this task; the
others show what the rule seam is for.

### Completion rules (activity settings blob, content-owned)

```jsonc
// Text lesson — no rule authored → manual (the default)
{ "type": "text", "title": "Safety intro", "body": "…" }

// Video lesson — auto-complete at 80% watched
{ "type": "video", "title": "TIG basics",
  "video": { "assetId": "ast_84h", "durationSeconds": 1475 },
  "completion": { "rule": "watch-percent", "percent": 80 } }

// Mixed lesson — watch the video, then the button counts
{ "type": "composite",
  "blocks": [ { "kind": "text" }, { "kind": "video", "assetId": "ast_2kq", "durationSeconds": 480 } ],
  "completion": { "rule": "watch-then-manual", "percent": 90 } }
```

### Reports

```jsonc
{}                                  // opened → record created (startedAt)
{ "position": { "seconds": 612 } }  // video heartbeat (~10s) → resume point
{ "position": { "seconds": 1310 } } // crosses 80% of 1475 → service completes
{ "completed": true }               // the button
```

- **Text**: `{}` on open, `{ completed: true }` on click → `"completed"`.
- **Video**: the service notices `1310 / 1475 ≥ 80%` on an ordinary heartbeat
  and answers `{ "status": "completed" }`. The button at 40% watched →
  `{ "status": "in-progress" }` — claim heard, rule unmet, nothing recorded.
- **Mixed**: `{ completed: true }` only lands once the video part passed 90%.

### Stored records (mid-course snapshot)

```jsonc
// watching, not done — position is the resume point
{ "targetType": "activity", "targetId": "act_31c", "studentId": "stu_7v",
  "startedAt": "…T09:12:04Z", "position": { "seconds": 612 }, "completedAt": null }

// text lesson, done via button
{ "targetType": "activity", "targetId": "act_58a",
  "startedAt": "…T08:55:11Z", "position": null, "completedAt": "…T08:59:40Z" }

// module record — created complete when its last activity completed
{ "targetType": "module", "targetId": "mod_c2f",
  "startedAt": "…T10:02:19Z", "position": null, "completedAt": "…T10:02:19Z" }

// course record — same, when the last module's last activity completed
{ "targetType": "course", "targetId": "crs_9f2", "completedAt": "…T10:02:19Z" }
```

Percent never appears — derived on read against current structure.

### Events (outbox, same transaction as the write that caused them)

```jsonc
{ "type": "progress.started", "orgId": "org_1", "courseId": "crs_9f2",
  "record": { "targetType": "activity", "targetId": "act_31c" } }

// the heartbeat that crossed the threshold produces up to three, atomically:
{ "type": "progress.completed", "courseId": "crs_9f2",
  "record": { "targetType": "activity", "targetId": "act_31c" } }
{ "type": "progress.completed", "courseId": "crs_9f2",
  "record": { "targetType": "module", "targetId": "mod_c2f" } }
{ "type": "progress.completed", "courseId": "crs_9f2",
  "record": { "targetType": "course", "targetId": "crs_9f2" } }
```

A future automation ("course completed → post to Slack, issue certificate")
subscribes to `progress.completed` and filters `record.targetType === "course"`.

The video rule needs `durationSeconds` (or a player-computed percent) authored
into the blob — rule evaluation is only as good as what content stores, which is
why `manual` is the only rule this task implements.

## 11. Tests

- `core/progress/service.test.ts` — rewrite around `report`: first-touch insert
  + started event; `completed` claim → completed event (and rejected when a rule
  is unmet); claim on a completed activity → no-op,
  no event; module completes when its last activity does; course completes when
  its last module does; container records created complete emit only
  `progress.completed`; fake UoW captures appended events (identity's test
  pattern).
- Reporting: `courseProgress` math — status map, percent against current
  structure, denominator shift after a structure edit.
- Route-level behavior is covered by the service/reporting tests plus schema
  validation; no new route test harness.
