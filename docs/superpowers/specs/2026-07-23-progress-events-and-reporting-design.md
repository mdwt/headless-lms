# Progress reporting, completion decisions & progress events

The student frontend can only **report** what happened — an activity was opened,
the player is at a position, the learner claims they're done — as **xAPI
statements** (constrained profile). It never decides completion. The progress service processes each report, applies the activity's
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

Reports are **xAPI statements** (constrained profile) — the standard "actor verb
object" usage vocabulary instead of a bespoke shape, so external players and
SCORM/cmi5 shims can emit the same thing our UI does. Profile constraints:

- **Actor comes from the session**, never the body (ignored if present).
- **Object comes from the URL** (the activity), course from the URL too.
- **Supported verbs** (ADL registry IRIs):
  - `…/verbs/launched` — student opened the activity
  - `…/verbs/progressed` — position report; the opaque position payload rides in
    `result.extensions` under our extension IRI
  - `…/verbs/completed` — the learner/player *asserts* completion — a claim the
    service validates, exactly xAPI's semantics (cmi5's moveOn makes the same
    split)
- Statements with other verbs are accepted (200), ensure the record exists, and
  are otherwise ignored — forgiving to richer emitters, no contract churn later.

Per type ownership, the statement/input types are declared in
`@headless-lms/types` (`progress.ts`) and re-exported by the context's
`types.ts`:

```ts
export interface ProgressStatement {
  verb: { id: string; display?: Record<string, string> };
  result?: {
    completion?: boolean;
    success?: boolean;
    duration?: string;
    extensions?: Record<string, unknown>;  // position payload lives here
  };
  timestamp?: string;
}

export interface ReportProgressInput {
  studentId: string;
  courseId: string;
  activityId: string;
  statement: ProgressStatement;
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
2. **Apply position** — `progressed` statements update the payload (taken from
   `result.extensions`, stored opaque). No event.
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
export const ProgressStatement = z.object({
  verb: z.object({
    id: z.string(),                                  // verb IRI
    display: z.record(z.string(), z.string()).optional(),
  }),
  result: z
    .object({
      completion: z.boolean().optional(),
      success: z.boolean().optional(),
      duration: z.string().optional(),
      extensions: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  timestamp: z.string().optional(),
});

export const ActivityProgress = z.object({
  status: z.enum(["in-progress", "completed"]),
});

export const CourseProgress = z.object({
  /** Keyed by activity id; absent key = not started. */
  activities: z.record(z.string(), z.enum(["in-progress", "completed"])),
  percent: z.number(),
  completed: z.boolean(),
});
```

## 5. HTTP routes (`http/routes/learn.ts`, tag `Learn`)

Both session-guarded via `resolveStudentScope`, like every Learn route.

- `POST /api/learn/courses/:courseId/activities/:activityId/progress` — body
  `ProgressStatement`, response `200 ActivityProgress`. Always 200 when
  processed: a `completed` claim with an unmet rule returns
  `status: "in-progress"` — that *is* the answer. 4xx only for transport-level
  problems (bad body, no session, unknown activity → 404). This is the wire
  format future SCORM support converges into: a player-side shim translates cmi
  calls to statements (ADL's standard mapping), with `suspend_data` riding as
  the position payload — no endpoint changes.
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
- **Report**: `toggleComplete` becomes one-way `markComplete` — sends a
  `completed` statement, applies the returned `status` to the store. The
  button's completed state is terminal (the domain has no un-complete).
  Course-complete toast keeps deriving from the local map; the GET is the
  authoritative refresh.
- **Open**: entering an activity sends a `launched` statement (fire-and-forget)
  so `progress.started` reflects reality, not just completions.
- `progressed` statements are wired when a player that produces positions
  exists; the contract already accepts them.

## 10. Tests

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
