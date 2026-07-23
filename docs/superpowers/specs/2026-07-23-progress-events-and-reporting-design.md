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

A report is a discriminated claim about one activity, in one course, by one
student. Per type ownership, `ProgressReport` / `ReportProgressInput` are
declared in `@headless-lms/types` (`progress.ts`) and re-exported by the
context's `types.ts`:

```ts
export type ProgressReport =
  | { kind: "opened" }
  | { kind: "position"; position: unknown }
  | { kind: "done" };   // a claim, not a fact — the service validates it

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
2. **Apply position** — `position` reports update the payload. No event.
3. **Evaluate completion** — the service reads the activity via
   `ContentService` (core→core through `content/index.js`) and interprets the
   completion-rule slice of the settings blob. Today the only interpretation is
   *no rule → manual*: a `done` claim completes the activity. A present-but-unmet
   rule means the `done` claim records nothing — the activity stays in progress.
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
export const ProgressReport = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("opened") }),
  z.object({ kind: z.literal("position"), position: z.unknown() }),
  z.object({ kind: z.literal("done") }),
]);

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
  `ProgressReport`, response `200 ActivityProgress`. Always 200 when processed:
  a `done` claim with an unmet rule returns `status: "in-progress"` — that *is*
  the answer. 4xx only for transport-level problems (bad body, no session,
  unknown activity → 404).
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
  `{ kind: "done" }`, applies the returned `status` to the store. The button's
  completed state is terminal (the domain has no un-complete). Course-complete
  toast keeps deriving from the local map; the GET is the authoritative refresh.
- **Open**: entering an activity sends `{ kind: "opened" }` (fire-and-forget) so
  `progress.started` reflects reality, not just completions.
- Position reports are wired when a player that produces positions exists; the
  contract already accepts them.

## 10. Tests

- `core/progress/service.test.ts` — rewrite around `report`: first-touch insert
  + started event; done → completed event; done on completed activity → no-op,
  no event; module completes when its last activity does; course completes when
  its last module does; container records created complete emit only
  `progress.completed`; fake UoW captures appended events (identity's test
  pattern).
- Reporting: `courseProgress` math — status map, percent against current
  structure, denominator shift after a structure edit.
- Route-level behavior is covered by the service/reporting tests plus schema
  validation; no new route test harness.
