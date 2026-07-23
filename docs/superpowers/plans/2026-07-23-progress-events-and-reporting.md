# Progress Reporting, Completion Decisions & Progress Events — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Students report usage (`{}` / `{ position }` / `{ completed: true }`); the progress service decides completion (activity rule → module → course, one transaction), stores records, and emits `progress.started` / `progress.completed` through the transactional outbox; the student app hydrates from and reports to the new Learn endpoints.

**Architecture:** Hexagonal server (`packages/server`): domain in `core/progress`, Drizzle repo in `adapters/db`, UoW+outbox pattern copied from `core/identity`, read view in `reporting/learn`, schema-first routes in `http/routes/learn.ts` off `packages/api-contract` Zod schemas, SDK regenerated from OpenAPI. Spec: `docs/superpowers/specs/2026-07-23-progress-events-and-reporting-design.md`.

**Tech Stack:** TypeScript (strict, ESM — relative imports end `.js`), Fastify 5 + fastify-type-provider-zod, zod 4, Drizzle/Postgres, vitest, Next.js (student app).

## Global Constraints

- Never add AI-attribution trailers (`Co-Authored-By`, "Generated with Claude Code", …) to commits or PRs.
- Comments: only when necessary, one short line; match surrounding file style.
- Type ownership: domain entities/DTOs/events are declared in `packages/types/src/progress.ts`; `core/progress/{model,types,events}.ts` only re-export.
- `core/` may not import `adapters/`, `http/`, `app/`, `reporting/`, or drizzle. Context→context imports only via the other context's `index.ts`. Run `pnpm lint` after cross-layer changes.
- `openapi.json` + `packages/sdk/src/generated/` are committed; regenerate with `pnpm gen:sdk` (needs Postgres up, reads env via `apps/api`).
- Run all workspace commands from the repo root.

---

### Task 1: Domain types + progress core rewrite

**Files:**
- Modify: `packages/types/src/progress.ts`
- Modify: `packages/server/src/core/progress/types.ts`
- Modify: `packages/server/src/core/progress/events.ts`
- Modify: `packages/server/src/core/progress/model.ts` (no change needed — verify re-exports still resolve)
- Modify: `packages/server/src/core/progress/ports.ts`
- Modify: `packages/server/src/core/progress/service.ts`
- Modify: `packages/server/src/core/progress/index.ts`
- Test: `packages/server/src/core/progress/service.test.ts` (rewrite)

**Interfaces:**
- Consumes: `UnitOfWork`, `OutboxAppender`, `NewDomainEvent`, `Logger` from `core/shared/ports.js`; `genId` from `core/shared/id.js`; `NotFoundError` from `core/shared/errors.js`; `ContentService`, `Module` from `core/content/index.js` (`listForCourse(orgId, courseId): Promise<Module[]>`, `Module.activities: { id, settings, … }[]`).
- Produces (later tasks rely on these exact names):
  - `ProgressTargetType = "activity" | "module" | "course"`
  - `ProgressReport { position?: unknown; completed?: boolean }`
  - `ReportProgressInput { studentId; courseId; activityId; report: ProgressReport }`
  - `ProgressStarted` / `ProgressCompleted` / `ProgressEvent` / `NewProgressEvent`
  - `ProgressService { report(orgId, input): Promise<ProgressRecord>; get(orgId, target): Promise<ProgressRecord | null>; listByTargets(orgId, studentId, targetIds): Promise<ProgressRecord[]> }`
  - `ProgressRepository` + `findByTargets(orgId, studentId, targetIds): Promise<ProgressRecord[]>`
  - `ProgressWriteScope { progress: ProgressRepository; outbox: OutboxAppender }`, `ProgressUnitOfWork = UnitOfWork<ProgressWriteScope>`
  - `ProgressServiceImpl` constructor: `(repo, content, uow | undefined, now, logger?)`

- [ ] **Step 1: Update `packages/types/src/progress.ts`**

Replace the whole file:

```ts
// progress context — domain entities, DTOs, and events.
//
// A ProgressRecord is one row per student per target (an activity, module, or
// course). Lifecycle: startedAt on first report, position (an opaque resume
// payload the player reports) updated as the learner advances, completedAt set
// when the completion rule is satisfied (null = still in progress). The target
// is denormalized (type + id) so a record survives structure edits. Percentage
// and resume state are derived on read — nothing here stores a percentage.

import type { DomainEvent } from "./shared.js";

export type ProgressTargetType = "activity" | "module" | "course";

export interface ProgressRecord {
  readonly id: string;
  readonly orgId: string;
  /** The learner's `students.id` (global, not org-scoped). */
  readonly studentId: string;
  readonly targetType: ProgressTargetType;
  readonly targetId: string;
  startedAt: string;
  /** Opaque typed resume payload; the player/service interprets it per target type. */
  position: unknown | null;
  /** null = in progress. */
  completedAt: string | null;
}

export type ProgressId = string;

/** Identifies a single target a student can make progress against. */
export interface ProgressTarget {
  studentId: string;
  targetType: ProgressTargetType;
  targetId: string;
}

/** Usage parameters the frontend reports — never a decision. `{}` is a bare
 *  touch, `position` a player update, `completed` a claim the service validates. */
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

/** Domain events the progress context emits. */
export interface ProgressStarted extends DomainEvent {
  type: "progress.started";
  /** The course whose structure the target belongs to. */
  courseId: string;
  record: ProgressRecord;
}

export interface ProgressCompleted extends DomainEvent {
  type: "progress.completed";
  courseId: string;
  record: ProgressRecord;
}

export type ProgressEvent = ProgressStarted | ProgressCompleted;
```

Note: `RecordPositionInput` is deleted (folded into `report`).

- [ ] **Step 2: Update the core re-export files**

`packages/server/src/core/progress/types.ts`:

```ts
// progress context — DTOs, owned by @headless-lms/types.
export type {
  ProgressId,
  ProgressTarget,
  ProgressReport,
  ReportProgressInput,
} from '@headless-lms/types';
```

`packages/server/src/core/progress/events.ts`:

```ts
// progress context — domain events, owned by @headless-lms/types.
import type { NewDomainEvent } from '../shared/ports.js';
import type { ProgressEvent } from '@headless-lms/types';

export type { ProgressEvent, ProgressStarted, ProgressCompleted } from '@headless-lms/types';
export type NewProgressEvent = NewDomainEvent<ProgressEvent>;
```

`packages/server/src/core/progress/index.ts`:

```ts
// progress context — public surface. Re-export only what other contexts may use.
export { ProgressServiceImpl } from './service.js';
export type { ProgressService, ProgressRepository, ProgressUnitOfWork } from './ports.js';
export type { ProgressRecord, ProgressTargetType } from './model.js';
export type { ProgressId, ProgressTarget, ProgressReport, ReportProgressInput } from './types.js';
export type { ProgressEvent, ProgressStarted, ProgressCompleted } from './events.js';
```

`model.ts` already re-exports `ProgressTargetType, ProgressRecord` — unchanged.

- [ ] **Step 3: Update `packages/server/src/core/progress/ports.ts`**

Replace the whole file:

```ts
// progress context — ports.
// Inbound: the use-case interface the service implements.
// Outbound: the persistence contract the repository fulfils.
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';
import type { ProgressRecord } from './model.js';
import type { ProgressTarget, ReportProgressInput } from './types.js';

// Inbound port (use cases the service exposes).
export interface ProgressService {
  /** Process a usage report: ensure the record, apply position, evaluate
   *  completion (activity rule, then module/course against current structure),
   *  emit events. Returns the activity's record after the decision. */
  report(orgId: string, input: ReportProgressInput): Promise<ProgressRecord>;
  /** Fetch the record for a single (student, target), or null. */
  get(orgId: string, target: ProgressTarget): Promise<ProgressRecord | null>;
  /** Records for a set of target ids — the read the reporting layer composes. */
  listByTargets(orgId: string, studentId: string, targetIds: string[]): Promise<ProgressRecord[]>;
}

// Outbound port (persistence contract the repository fulfils).
export interface ProgressRepository {
  insert(orgId: string, record: ProgressRecord): Promise<ProgressRecord>;
  /** Scoped to the org — returns the record for the unique (student, target) key, or null. */
  findByTarget(orgId: string, target: ProgressTarget): Promise<ProgressRecord | null>;
  /** All of the student's records whose targetId is in the set. */
  findByTargets(orgId: string, studentId: string, targetIds: string[]): Promise<ProgressRecord[]>;
  update(
    orgId: string,
    id: string,
    patch: Partial<Pick<ProgressRecord, 'position' | 'completedAt'>>,
  ): Promise<ProgressRecord | null>;
}

/** Writes that emit events run through this scope so row + outbox entry commit
 *  in one transaction. */
export interface ProgressWriteScope {
  progress: ProgressRepository;
  outbox: OutboxAppender;
}
export type ProgressUnitOfWork = UnitOfWork<ProgressWriteScope>;
```

- [ ] **Step 4: Rewrite the test file (failing first)**

Replace `packages/server/src/core/progress/service.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ProgressServiceImpl } from './service.js';
import type { ProgressRepository, ProgressUnitOfWork } from './ports.js';
import type { ProgressRecord } from './model.js';
import type { NewProgressEvent } from './events.js';
import type { ContentService, Module } from '../content/index.js';
import { NotFoundError } from '../shared/errors.js';

function fakeRepo() {
  const records: ProgressRecord[] = [];
  const repo: ProgressRepository = {
    async insert(_orgId, record) {
      records.push(record);
      return record;
    },
    async findByTarget(orgId, target) {
      return (
        records.find(
          (r) =>
            r.orgId === orgId &&
            r.studentId === target.studentId &&
            r.targetType === target.targetType &&
            r.targetId === target.targetId,
        ) ?? null
      );
    },
    async findByTargets(orgId, studentId, targetIds) {
      return records.filter(
        (r) => r.orgId === orgId && r.studentId === studentId && targetIds.includes(r.targetId),
      );
    },
    async update(orgId, id, patch) {
      const record = records.find((r) => r.orgId === orgId && r.id === id);
      if (!record) {
        return null;
      }
      Object.assign(record, patch);
      return record;
    },
  };
  return { repo, records };
}

function fakeUow(repo: ProgressRepository) {
  const appended: NewProgressEvent[] = [];
  const uow: ProgressUnitOfWork = {
    run: (fn) =>
      fn({
        progress: repo,
        outbox: {
          append: async (events) => {
            appended.push(...(events as NewProgressEvent[]));
          },
        },
      }),
  };
  return { uow, appended };
}

/** One course, two modules: m1 = [a1 (manual), a2 (manual)], m2 = [a3 (manual)]. */
function structure(overrides?: { a1Settings?: unknown }): Module[] {
  return [
    {
      id: 'm1',
      courseId: 'c1',
      title: 'Module 1',
      seq: 0,
      activities: [
        { id: 'a1', moduleId: 'm1', seq: 0, settings: overrides?.a1Settings ?? {}, assetIds: [] },
        { id: 'a2', moduleId: 'm1', seq: 1, settings: {}, assetIds: [] },
      ],
    },
    {
      id: 'm2',
      courseId: 'c1',
      title: 'Module 2',
      seq: 1,
      activities: [{ id: 'a3', moduleId: 'm2', seq: 0, settings: {}, assetIds: [] }],
    },
  ];
}

function fakeContent(modules: Module[]): ContentService {
  return { listForCourse: async () => modules } as unknown as ContentService;
}

function makeService(modules: Module[]) {
  const { repo, records } = fakeRepo();
  const { uow, appended } = fakeUow(repo);
  const svc = new ProgressServiceImpl(repo, fakeContent(modules), uow, () => '2026-07-23T10:00:00Z');
  return { svc, records, appended };
}

const input = (activityId: string, report: { position?: unknown; completed?: boolean }) => ({
  studentId: 's1',
  courseId: 'c1',
  activityId,
  report,
});

describe('ProgressService.report', () => {
  it('bare report creates the record and emits progress.started once', async () => {
    const { svc, records, appended } = makeService(structure());
    const first = await svc.report('org-1', input('a1', {}));
    const second = await svc.report('org-1', input('a1', {}));
    expect(first.id).toBe(second.id);
    expect(records).toHaveLength(1);
    expect(records[0]?.startedAt).toBe('2026-07-23T10:00:00Z');
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      type: 'progress.started',
      orgId: 'org-1',
      courseId: 'c1',
    });
  });

  it('position report stores the payload without completing', async () => {
    const { svc, appended } = makeService(structure());
    const record = await svc.report('org-1', input('a1', { position: { seconds: 612 } }));
    expect(record.position).toEqual({ seconds: 612 });
    expect(record.completedAt).toBeNull();
    expect(appended.filter((e) => e.type === 'progress.completed')).toHaveLength(0);
  });

  it('completed claim on a rule-less activity completes it and emits progress.completed', async () => {
    const { svc, appended } = makeService(structure());
    const record = await svc.report('org-1', input('a1', { completed: true }));
    expect(record.completedAt).toBe('2026-07-23T10:00:00Z');
    const completed = appended.filter((e) => e.type === 'progress.completed');
    expect(completed).toHaveLength(1);
    expect((completed[0] as { record: ProgressRecord }).record.targetId).toBe('a1');
  });

  it('completed claim with an unmet rule records nothing', async () => {
    const { svc, appended } = makeService(
      structure({ a1Settings: { completion: { rule: 'watch-percent', percent: 80 } } }),
    );
    const record = await svc.report('org-1', input('a1', { completed: true }));
    expect(record.completedAt).toBeNull();
    expect(appended.filter((e) => e.type === 'progress.completed')).toHaveLength(0);
  });

  it('re-claiming a completed activity changes nothing and emits nothing', async () => {
    const { svc, appended } = makeService(structure());
    await svc.report('org-1', input('a1', { completed: true }));
    const before = appended.length;
    await svc.report('org-1', input('a1', { completed: true }));
    expect(appended).toHaveLength(before);
  });

  it('last activity of a module completes the module; last module completes the course', async () => {
    const { svc, records, appended } = makeService(structure());
    await svc.report('org-1', input('a1', { completed: true }));
    await svc.report('org-1', input('a2', { completed: true }));
    // m1 done, course not (a3 open)
    expect(records.find((r) => r.targetType === 'module' && r.targetId === 'm1')?.completedAt).toBe(
      '2026-07-23T10:00:00Z',
    );
    expect(records.find((r) => r.targetType === 'course')).toBeUndefined();
    await svc.report('org-1', input('a3', { completed: true }));
    expect(records.find((r) => r.targetType === 'module' && r.targetId === 'm2')?.completedAt).toBeTruthy();
    expect(records.find((r) => r.targetType === 'course' && r.targetId === 'c1')?.completedAt).toBeTruthy();
    const completedTargets = appended
      .filter((e) => e.type === 'progress.completed')
      .map((e) => (e as { record: ProgressRecord }).record.targetType);
    // a1, a2+m1, a3+m2+course
    expect(completedTargets).toEqual(['activity', 'activity', 'module', 'activity', 'module', 'course']);
  });

  it('draft activities (published: false) are excluded from the denominator', async () => {
    const modules = structure();
    (modules[0]!.activities[1]! as { settings: unknown }).settings = { published: false };
    const { svc, records } = makeService(modules);
    await svc.report('org-1', input('a1', { completed: true }));
    expect(records.find((r) => r.targetType === 'module' && r.targetId === 'm1')?.completedAt).toBeTruthy();
  });

  it('rejects a report for an activity not in the course', async () => {
    const { svc } = makeService(structure());
    await expect(svc.report('org-1', input('nope', {}))).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('ProgressService reads', () => {
  it('get and listByTargets return stored records', async () => {
    const { svc } = makeService(structure());
    await svc.report('org-1', input('a1', { completed: true }));
    const rec = await svc.get('org-1', { studentId: 's1', targetType: 'activity', targetId: 'a1' });
    expect(rec?.completedAt).toBeTruthy();
    const list = await svc.listByTargets('org-1', 's1', ['a1', 'a2']);
    expect(list).toHaveLength(1);
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `pnpm vitest run packages/server/src/core/progress/service.test.ts`
Expected: FAIL — compile errors (`report` not on service, `findByTargets` missing, constructor arity).

- [ ] **Step 6: Rewrite `packages/server/src/core/progress/service.ts`**

```ts
// progress context — service implementation (inbound port).
// The frontend only reports usage; this service makes every completion
// decision. One report runs in one UoW transaction: ensure the record, apply
// position, evaluate the activity's completion rule, then module/course
// against current published structure — appending events with the writes.
// Percentage/resume are derived by readers, never stored here.
import { genId } from '../shared/id.js';
import { NotFoundError } from '../shared/errors.js';
import type { ProgressRecord } from './model.js';
import type {
  ProgressRepository,
  ProgressService,
  ProgressUnitOfWork,
  ProgressWriteScope,
} from './ports.js';
import type { ProgressTarget, ReportProgressInput } from './types.js';
import type { NewProgressEvent } from './events.js';
import type { ContentService, Module } from '../content/index.js';
import type { Logger, OutboxAppender } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';

const noopOutbox: OutboxAppender = { append: async () => {} };

/** Mirrors reporting/learn: `settings.published === false` is the only draft signal. */
function isActivityPublished(settings: unknown): boolean {
  return (settings as { published?: boolean } | null)?.published !== false;
}

/** The completion-rule seam. Only `manual` ships: no authored rule → the
 *  learner's claim decides. Authored rules are never satisfied until their
 *  evaluators exist. */
function completionSatisfied(settings: unknown, claimed: boolean): boolean {
  const rule = (settings as { completion?: { rule?: string } } | null)?.completion?.rule;
  if (!rule || rule === 'manual') {
    return claimed;
  }
  return false;
}

export class ProgressServiceImpl implements ProgressService {
  private readonly uow: ProgressUnitOfWork;

  constructor(
    private readonly repo: ProgressRepository,
    private readonly content: ContentService,
    uow: ProgressUnitOfWork | undefined,
    private readonly now: () => string,
    private readonly logger: Logger = noopLogger,
  ) {
    this.uow = uow ?? { run: (fn) => fn({ progress: repo, outbox: noopOutbox }) };
  }

  async report(orgId: string, input: ReportProgressInput): Promise<ProgressRecord> {
    const modules = await this.content.listForCourse(orgId, input.courseId);
    const activity = modules
      .flatMap((m) => m.activities)
      .find((a) => a.id === input.activityId);
    if (!activity || !isActivityPublished(activity.settings)) {
      throw new NotFoundError('Activity', input.activityId);
    }
    return this.uow.run(async (scope) => {
      const events: NewProgressEvent[] = [];
      let record = await this.ensureActivityRecord(orgId, input, scope, events);
      if (input.report.position !== undefined && !record.completedAt) {
        record =
          (await scope.progress.update(orgId, record.id, { position: input.report.position })) ??
          record;
      }
      if (!record.completedAt && completionSatisfied(activity.settings, input.report.completed === true)) {
        record =
          (await scope.progress.update(orgId, record.id, { completedAt: this.now() })) ?? record;
        events.push({ type: 'progress.completed', orgId, courseId: input.courseId, record });
        await this.completeContainers(orgId, input, modules, scope, events);
        this.logger.info('progress completed', { orgId, recordId: record.id });
      }
      if (events.length > 0) {
        await scope.outbox.append(events);
      }
      return record;
    });
  }

  private async ensureActivityRecord(
    orgId: string,
    input: ReportProgressInput,
    scope: ProgressWriteScope,
    events: NewProgressEvent[],
  ): Promise<ProgressRecord> {
    const target: ProgressTarget = {
      studentId: input.studentId,
      targetType: 'activity',
      targetId: input.activityId,
    };
    const existing = await scope.progress.findByTarget(orgId, target);
    if (existing) {
      return existing;
    }
    const record = await scope.progress.insert(orgId, {
      id: genId('progress'),
      orgId,
      studentId: input.studentId,
      targetType: 'activity',
      targetId: input.activityId,
      startedAt: this.now(),
      position: null,
      completedAt: null,
    });
    events.push({ type: 'progress.started', orgId, courseId: input.courseId, record });
    this.logger.info('progress started', { orgId, recordId: record.id });
    return record;
  }

  /** After an activity completes: newly-complete containers get their records
   *  (created complete) and a progress.completed event — same transaction. */
  private async completeContainers(
    orgId: string,
    input: ReportProgressInput,
    modules: Module[],
    scope: ProgressWriteScope,
    events: NewProgressEvent[],
  ): Promise<void> {
    const byModule = modules.map((m) => ({
      id: m.id,
      activityIds: m.activities.filter((a) => isActivityPublished(a.settings)).map((a) => a.id),
    }));
    const allIds = byModule.flatMap((m) => m.activityIds);
    const records = await scope.progress.findByTargets(orgId, input.studentId, allIds);
    const done = new Set(
      records.filter((r) => r.targetType === 'activity' && r.completedAt).map((r) => r.targetId),
    );
    const containing = byModule.find((m) => m.activityIds.includes(input.activityId));
    if (containing && containing.activityIds.every((id) => done.has(id))) {
      await this.ensureContainerComplete(orgId, input, 'module', containing.id, scope, events);
    }
    if (allIds.length > 0 && allIds.every((id) => done.has(id))) {
      await this.ensureContainerComplete(orgId, input, 'course', input.courseId, scope, events);
    }
  }

  private async ensureContainerComplete(
    orgId: string,
    input: ReportProgressInput,
    targetType: 'module' | 'course',
    targetId: string,
    scope: ProgressWriteScope,
    events: NewProgressEvent[],
  ): Promise<void> {
    const target: ProgressTarget = { studentId: input.studentId, targetType, targetId };
    const existing = await scope.progress.findByTarget(orgId, target);
    if (existing?.completedAt) {
      return;
    }
    const record = existing
      ? ((await scope.progress.update(orgId, existing.id, { completedAt: this.now() })) ?? existing)
      : await scope.progress.insert(orgId, {
          id: genId('progress'),
          orgId,
          studentId: input.studentId,
          targetType,
          targetId,
          startedAt: this.now(),
          position: null,
          completedAt: this.now(),
        });
    events.push({ type: 'progress.completed', orgId, courseId: input.courseId, record });
  }

  get(orgId: string, target: ProgressTarget): Promise<ProgressRecord | null> {
    return this.repo.findByTarget(orgId, target);
  }

  listByTargets(orgId: string, studentId: string, targetIds: string[]): Promise<ProgressRecord[]> {
    return this.repo.findByTargets(orgId, studentId, targetIds);
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm vitest run packages/server/src/core/progress/service.test.ts`
Expected: PASS (all tests).

Note: the whole-workspace build may still fail here (repo/container reference the old API) — that's Tasks 2–3.

- [ ] **Step 8: Commit**

```bash
git add packages/types/src/progress.ts packages/server/src/core/progress/
git commit -m "feat(progress): usage reports, completion decisions, domain events"
```

---

### Task 2: Drizzle repository + schema enum

**Files:**
- Modify: `packages/server/src/adapters/db/schema/progress.ts`
- Modify: `packages/server/src/adapters/db/repositories/progress.ts`

**Interfaces:**
- Consumes: `ProgressRepository` (with `findByTargets`) from Task 1.
- Produces: `DrizzleProgressRepository` implementing the full port, constructible on a `Tx` (already is — it takes `NodePgDatabase`, which the UoW's `tx` satisfies, same as the identity repo).

- [ ] **Step 1: Update the schema enum**

In `packages/server/src/adapters/db/schema/progress.ts`, change:

```ts
    targetType: text('target_type', {
      enum: ['lesson', 'assessment', 'module', 'course'],
    }).notNull(),
```

to:

```ts
    targetType: text('target_type', {
      enum: ['activity', 'module', 'course'],
    }).notNull(),
```

Also update the file's header comment: `(lesson, assessment, module, or course)` → `(activity, module, or course)`. Drizzle's text-enum is type-level only — the column is plain `text`, no SQL or snapshot change (verified: `0000_baseline.sql` has no CHECK on `target_type`). Do **not** run `pnpm db:generate`.

- [ ] **Step 2: Add `findByTargets` to the repository**

In `packages/server/src/adapters/db/repositories/progress.ts`, add `inArray` to the drizzle import:

```ts
import { and, eq, inArray } from 'drizzle-orm';
```

and add the method to `DrizzleProgressRepository` (after `findByTarget`):

```ts
  async findByTargets(
    orgId: string,
    studentId: string,
    targetIds: string[],
  ): Promise<ProgressRecord[]> {
    if (targetIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(progressRecords)
      .where(
        and(
          eq(progressRecords.orgId, orgId),
          eq(progressRecords.studentId, studentId),
          inArray(progressRecords.targetId, targetIds),
        ),
      );
    return rows.map(toRecord);
  }
```

- [ ] **Step 3: Typecheck the server workspace**

Run: `pnpm --filter @headless-lms/server typecheck`
Expected: the only remaining errors are in `app/container.ts` (constructor arity — fixed in Task 3). If the repo file itself errors, fix before moving on.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/adapters/db/schema/progress.ts packages/server/src/adapters/db/repositories/progress.ts
git commit -m "feat(progress): activity target type, findByTargets repository read"
```

---

### Task 3: Container wiring

**Files:**
- Modify: `packages/server/src/app/container.ts` (progress construction, ~line 267)

**Interfaces:**
- Consumes: `ProgressServiceImpl(repo, content, uow, now, logger)` from Task 1; `DrizzleUnitOfWork`, `DrizzleOutboxAppender`, `DrizzleProgressRepository` (existing imports).
- Produces: `container.progress` with the new API, events flowing to the outbox (the relay → bus path is already wired; no subscriber is added anywhere).

- [ ] **Step 1: Rewire progress in `container.ts`**

Replace:

```ts
  const progress = new ProgressServiceImpl(
    new DrizzleProgressRepository(db, progressLogger),
    () => new Date().toISOString(),
    progressLogger,
  );
```

with (keeping it after `content` is constructed, which it already is):

```ts
  // Progress: report writes + outbox append in one tx; content supplies the
  // structure and completion rules the service evaluates against.
  const progressUow = new DrizzleUnitOfWork(db, (tx) => ({
    progress: new DrizzleProgressRepository(tx, progressLogger),
    outbox: new DrizzleOutboxAppender(tx, outboxLogger),
  }));
  const progress = new ProgressServiceImpl(
    new DrizzleProgressRepository(db, progressLogger),
    content,
    progressUow,
    () => new Date().toISOString(),
    progressLogger,
  );
```

- [ ] **Step 2: Typecheck + full server tests**

Run: `pnpm --filter @headless-lms/server typecheck && pnpm --filter @headless-lms/server test`
Expected: PASS, no remaining arity errors.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/app/container.ts
git commit -m "feat(progress): wire report UoW and content dependency"
```

---

### Task 4: Reporting view — course progress

**Files:**
- Modify: `packages/server/src/reporting/learn/model.ts`
- Modify: `packages/server/src/reporting/learn/ports.ts`
- Modify: `packages/server/src/reporting/learn/service.ts`
- Modify: `packages/server/src/reporting/learn/index.ts` (export the new view type if the file re-exports model types)
- Modify: `packages/server/src/app/container.ts` (learn construction)
- Test: `packages/server/src/reporting/learn/service.test.ts`

**Interfaces:**
- Consumes: `ProgressService.listByTargets` / `.get` (Task 1), `ContentService.listForCourse`, existing `LearnEntitlementReader.activeRef`.
- Produces: `CourseProgressView { activities: Record<string, 'in-progress' | 'completed'>; percent: number; completed: boolean }` and `LearnReportService.courseProgress(orgId, studentId, courseId): Promise<CourseProgressView | null>` (null = not enrolled). Constructor becomes `(reader, content, progress, logger?)`.

- [ ] **Step 1: Add the view type**

In `packages/server/src/reporting/learn/model.ts` add:

```ts
/** Per-course progress for the student surface. Derived on read against the
 *  current published structure — never stored. */
export interface CourseProgressView {
  /** Keyed by activity id; absent key = not started. */
  activities: Record<string, 'in-progress' | 'completed'>;
  /** Integer 0–100: completed ÷ current published activities, rounded. */
  percent: number;
  /** The course target's own record says so. */
  completed: boolean;
}
```

In `ports.ts`, add to the `LearnReportService` interface:

```ts
  courseProgress(
    orgId: string,
    studentId: string,
    courseId: string,
  ): Promise<CourseProgressView | null>;
```

(import `CourseProgressView` from `./model.js`). If `index.ts` re-exports model types, add `CourseProgressView`.

- [ ] **Step 2: Write the failing tests**

The existing tests construct `new LearnReportServiceImpl(reader, content)` — the
constructor gains a required third `progress` param, so update every existing
construction to pass `fakeProgress([])`. Then append to
`packages/server/src/reporting/learn/service.test.ts`:

```ts
import type { ProgressRecord, ProgressService } from '../../core/progress/index.js';

function fakeProgress(records: ProgressRecord[]): ProgressService {
  return {
    report: async () => records[0]!,
    get: async (_orgId, target) =>
      records.find((r) => r.targetType === target.targetType && r.targetId === target.targetId) ??
      null,
    listByTargets: async (_orgId, _studentId, targetIds) =>
      records.filter((r) => r.targetType === 'activity' && targetIds.includes(r.targetId)),
  };
}

function progressRecord(
  partial: Partial<ProgressRecord> & Pick<ProgressRecord, 'targetType' | 'targetId'>,
): ProgressRecord {
  return {
    id: `p_${partial.targetId}`,
    orgId: 'o1',
    studentId: 'stu_1',
    startedAt: '2026-07-23T09:00:00Z',
    position: null,
    completedAt: null,
    ...partial,
  };
}

// One module: a1 + a2 published, a3 a draft.
const progressModules: Module[] = [
  {
    id: 'm1',
    courseId: 'c1',
    title: 'M1',
    seq: 0,
    activities: [
      { id: 'a1', moduleId: 'm1', seq: 0, settings: {}, assetIds: [] },
      { id: 'a2', moduleId: 'm1', seq: 1, settings: {}, assetIds: [] },
      { id: 'a3', moduleId: 'm1', seq: 2, settings: { published: false }, assetIds: [] },
    ],
  },
];

describe('LearnReportServiceImpl.courseProgress', () => {
  it('returns null when the student is not enrolled', async () => {
    const svc = new LearnReportServiceImpl(
      fakeReader([]),
      fakeContent({ c1: course('c1') }, { c1: progressModules }),
      fakeProgress([]),
    );
    expect(await svc.courseProgress('o1', 'stu_1', 'c1')).toBeNull();
  });

  it('maps records to statuses and derives percent from published activities only', async () => {
    const svc = new LearnReportServiceImpl(
      fakeReader([{ orgId: 'o1', courseId: 'c1' }]),
      fakeContent({ c1: course('c1') }, { c1: progressModules }),
      fakeProgress([
        progressRecord({ targetType: 'activity', targetId: 'a1', completedAt: '2026-07-23T09:30:00Z' }),
        progressRecord({ targetType: 'activity', targetId: 'a2' }),
        progressRecord({ targetType: 'activity', targetId: 'a3', completedAt: '2026-07-23T09:31:00Z' }),
      ]),
    );
    const view = await svc.courseProgress('o1', 'stu_1', 'c1');
    // a3 is a draft — absent from the map and the denominator
    expect(view).toEqual({
      activities: { a1: 'completed', a2: 'in-progress' },
      percent: 50,
      completed: false,
    });
  });

  it('completed reflects the course target record', async () => {
    const svc = new LearnReportServiceImpl(
      fakeReader([{ orgId: 'o1', courseId: 'c1' }]),
      fakeContent({ c1: course('c1') }, { c1: progressModules }),
      fakeProgress([
        progressRecord({ targetType: 'activity', targetId: 'a1', completedAt: '2026-07-23T09:30:00Z' }),
        progressRecord({ targetType: 'activity', targetId: 'a2', completedAt: '2026-07-23T09:32:00Z' }),
        progressRecord({ targetType: 'course', targetId: 'c1', completedAt: '2026-07-23T09:32:00Z' }),
      ]),
    );
    const view = await svc.courseProgress('o1', 'stu_1', 'c1');
    expect(view).toMatchObject({ percent: 100, completed: true });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run packages/server/src/reporting/learn/service.test.ts`
Expected: FAIL — `courseProgress` not implemented, constructor arity.

- [ ] **Step 4: Implement**

In `packages/server/src/reporting/learn/service.ts` — constructor gains progress:

```ts
  constructor(
    private readonly reader: LearnEntitlementReader,
    private readonly content: ContentService,
    private readonly progress: ProgressService,
    private readonly logger: Logger = noopLogger,
  ) {}
```

(import `ProgressService` from `'../../core/progress/index.js'`, `CourseProgressView` from `./model.js`). Add:

```ts
  async courseProgress(
    orgId: string,
    studentId: string,
    courseId: string,
  ): Promise<CourseProgressView | null> {
    const ref = await this.reader.activeRef(orgId, studentId, courseId);
    if (!ref) {
      return null;
    }
    const modules = await this.content.listForCourse(ref.orgId, courseId);
    const ids = modules.flatMap((m) =>
      m.activities.filter((a) => isActivityPublished(a.settings)).map((a) => a.id),
    );
    const records = await this.progress.listByTargets(ref.orgId, studentId, ids);
    const activities: CourseProgressView['activities'] = {};
    let done = 0;
    for (const r of records) {
      if (r.targetType !== 'activity') {
        continue;
      }
      activities[r.targetId] = r.completedAt ? 'completed' : 'in-progress';
      if (r.completedAt) {
        done += 1;
      }
    }
    const courseRecord = await this.progress.get(ref.orgId, {
      studentId,
      targetType: 'course',
      targetId: courseId,
    });
    return {
      activities,
      percent: ids.length > 0 ? Math.round((done / ids.length) * 100) : 0,
      completed: courseRecord?.completedAt != null,
    };
  }
```

- [ ] **Step 5: Rewire the learn service in `container.ts`**

```ts
    learn: new LearnReportServiceImpl(
      new DrizzleLearnRepository(db, reportingLogger),
      content,
      progress,
      reportingLogger,
    ),
```

(`progress` is constructed above `reporting` already.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run packages/server/src/reporting/learn/service.test.ts && pnpm --filter @headless-lms/server typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/reporting/learn/ packages/server/src/app/container.ts
git commit -m "feat(reporting): learn course progress view"
```

---

### Task 5: API contract + Learn routes

**Files:**
- Modify: `packages/api-contract/src/learn.ts`
- Modify: `packages/server/src/http/routes/learn.ts`

**Interfaces:**
- Consumes: `container.progress.report` (Task 1), `container.reporting.learn.courseProgress` (Task 4), existing `resolveStudentScope`, `NotFoundError`, error-handler plugin (maps `NotFoundError` → 404).
- Produces: `ProgressReport`, `ActivityProgress`, `CourseProgress`, `LearnActivityParams` schemas; routes with operationIds `reportActivityProgress` and `getLearnCourseProgress` (→ SDK method names in Task 6).

- [ ] **Step 1: Add contract schemas**

Append to `packages/api-contract/src/learn.ts`:

```ts
/** Usage parameters the student surface reports — never a completion decision.
 *  `{}` is a bare touch, `position` a player update, `completed` a claim the
 *  progress service validates. */
export const ProgressReport = z.object({
  position: z.unknown().optional(),
  completed: z.boolean().optional(),
});
export type ProgressReport = z.infer<typeof ProgressReport>;

/** The reported activity's state after the service decided. */
export const ActivityProgress = z.object({
  status: z.enum(["in-progress", "completed"]),
});
export type ActivityProgress = z.infer<typeof ActivityProgress>;

/** Per-course progress, derived on read against current structure. */
export const CourseProgress = z.object({
  /** Keyed by activity id; absent key = not started. */
  activities: z.record(z.string(), z.enum(["in-progress", "completed"])),
  /** Integer 0–100, completed ÷ current activities, rounded. */
  percent: z.int().min(0).max(100),
  completed: z.boolean(),
});
export type CourseProgress = z.infer<typeof CourseProgress>;

export const LearnActivityParams = z.object({
  courseId: z.string(),
  activityId: z.string(),
});
export type LearnActivityParams = z.infer<typeof LearnActivityParams>;
```

(Confirm the package exports `learn.ts` from its index — it does for the existing Learn schemas.)

- [ ] **Step 2: Add the routes**

In `packages/server/src/http/routes/learn.ts`, extend the contract import with `ProgressReport, ActivityProgress, CourseProgress, LearnActivityParams`, then add inside `learnRoutes` (after the existing routes):

```ts
  r.route({
    method: 'POST',
    url: '/api/learn/courses/:courseId/activities/:activityId/progress',
    preHandler: app.requireSession,
    schema: {
      operationId: 'reportActivityProgress',
      tags: ['Learn'],
      summary: 'Report usage on an activity; the progress service decides completion',
      params: LearnActivityParams,
      body: ProgressReport,
      response: { 200: ActivityProgress, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      // Enrollment gate — same visibility rule as every Learn read.
      const course = await learn.getCourse(scope.orgId, scope.studentId, req.params.courseId);
      if (!course) {
        throw new NotFoundError('Course', req.params.courseId);
      }
      const record = await container.progress.report(scope.orgId, {
        studentId: scope.studentId,
        courseId: req.params.courseId,
        activityId: req.params.activityId,
        report: req.body,
      });
      return { status: record.completedAt ? ('completed' as const) : ('in-progress' as const) };
    },
  });

  r.route({
    method: 'GET',
    url: '/api/learn/courses/:courseId/progress',
    preHandler: app.requireSession,
    schema: {
      operationId: 'getLearnCourseProgress',
      tags: ['Learn'],
      summary: "The student's progress in one course",
      params: LearnCourseIdParam,
      response: { 200: CourseProgress, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      const view = await learn.courseProgress(scope.orgId, scope.studentId, req.params.courseId);
      if (!view) {
        throw new NotFoundError('Course', req.params.courseId);
      }
      return view;
    },
  });
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @headless-lms/api-contract typecheck && pnpm --filter @headless-lms/server typecheck && pnpm --filter @headless-lms/server test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api-contract/src/learn.ts packages/server/src/http/routes/learn.ts
git commit -m "feat(learn): progress report and course progress endpoints"
```

---

### Task 6: Regenerate the SDK

**Files:**
- Modify (generated): `packages/sdk/openapi.json`, `packages/sdk/src/generated/*`

**Interfaces:**
- Produces: `Learn.reportActivityProgress({ path: { courseId, activityId }, body })` and `Learn.getLearnCourseProgress({ path: { courseId } })` for Task 7.

- [ ] **Step 1: Regenerate**

Postgres must be running (same env `pnpm dev` uses). Run: `pnpm gen:sdk`
Expected: `openapi.json` and `src/generated/` diffs containing `reportActivityProgress` and `getLearnCourseProgress` under the `Learn` class.

- [ ] **Step 2: Verify + typecheck**

Run: `git diff --stat packages/sdk && pnpm --filter @headless-lms/sdk typecheck`
Expected: only generated files changed; typecheck PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/sdk
git commit -m "chore(sdk): regenerate for learn progress endpoints"
```

---

### Task 7: Student app — hydrate, report, decide nothing

**Files:**
- Create: `apps/student/src/lib/api/progress-client.ts`
- Modify: `apps/student/src/lib/api/server.ts`
- Modify: `apps/student/src/lib/store.tsx`
- Modify: `apps/student/src/app/courses/[courseId]/page.tsx`
- Modify: `apps/student/src/components/player/course-player.tsx`

**Interfaces:**
- Consumes: SDK `Learn.getLearnCourseProgress` (server read, Task 6); the POST endpoint via browser `fetch` (client mutation — matches the app's existing client-call pattern in `welcome-view.tsx`); store's existing `setLessonStatus`, `Completion`, `LessonStatus` types.
- Produces: `reportProgress(courseId, activityId, report): Promise<LessonStatus | null>`; store gains `seedCompletion(courseId, completion)`; `CoursePlayer` gains an `initialCompletion` prop. `toggleComplete` is deleted (the domain has no un-complete).

- [ ] **Step 1: Client report helper**

Create `apps/student/src/lib/api/progress-client.ts`:

```ts
// Client-side progress reporting. The frontend only reports usage — the
// server decides completion; callers apply the returned status.
import type { LessonStatus } from "../types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface ProgressReport {
  position?: unknown;
  completed?: boolean;
}

export async function reportProgress(
  courseId: string,
  activityId: string,
  report: ProgressReport,
): Promise<LessonStatus | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/learn/courses/${courseId}/activities/${activityId}/progress`,
      {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(report),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { status: "in-progress" | "completed" };
    return data.status;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Server read for hydration**

In `apps/student/src/lib/api/server.ts`, add to `learnApi` (import `CourseProgress` type from the SDK types module the file already sources its types from, or inline the shape):

```ts
  async courseProgress(
    courseId: string,
  ): Promise<{ activities: Record<string, "in-progress" | "completed"> } | null> {
    ensureConfigured();
    const res = await Learn.getLearnCourseProgress({
      path: { courseId },
      ...(await authHeaders()),
    });
    if (res.error) {
      redirectIfNoStudent(res.response?.status);
      return null;
    }
    return res.data ?? null;
  },
```

- [ ] **Step 3: Store — seed, drop toggle**

In `apps/student/src/lib/store.tsx`:
- Delete `toggleComplete` (callback, `AppState` member, context value).
- Add:

```ts
  const seedCompletion = React.useCallback((courseId: string, completion: Completion) => {
    setCompletion((prev) => ({ ...prev, [courseId]: { ...completion, ...(prev[courseId] ?? {}) } }));
  }, []);
```

(local state wins over the seed so an in-flight session isn't downgraded), add `seedCompletion: (courseId: string, completion: Completion) => void;` to `AppState`, and update the file's header comment (the prototype note about swapping in a real mutation is now stale). Import `Completion` is already there.

- [ ] **Step 4: Page — fetch and pass initial completion**

In `apps/student/src/app/courses/[courseId]/page.tsx`, extend the parallel fetch:

```ts
  const [course, modules, org, progress] = await Promise.all([
    learnApi.getCourse(courseId),
    learnApi.listModules(courseId),
    learnApi.org(),
    learnApi.courseProgress(courseId),
  ]);
```

and pass `initialCompletion={progress?.activities ?? {}}` to `<CoursePlayer …>`.

- [ ] **Step 5: Player — seed, report open, one-way complete**

In `apps/student/src/components/player/course-player.tsx`:

- Add `initialCompletion?: Completion` to `CoursePlayerProps` (import `Completion` from `@/lib/types`); import `reportProgress` from `@/lib/api/progress-client`.
- Replace `const { toggleComplete, showToast } = useApp();` with `const { setLessonStatus, seedCompletion, showToast } = useApp();`
- Seed once on mount:

```ts
  React.useEffect(() => {
    if (initialCompletion) seedCompletion(course.id, initialCompletion);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per mount
  }, []);
```

- Report the open (fire-and-forget) and reflect it locally:

```ts
  React.useEffect(() => {
    if (!curLessonId) return;
    if (lessonStatus(completion, curLessonId) === "not-started") {
      setLessonStatus(course.id, curLessonId, "in-progress");
    }
    void reportProgress(course.id, curLessonId, {});
  }, [course.id, curLessonId]); // eslint-disable-line react-hooks/exhaustive-deps -- report on lesson change only
```

- Replace `markComplete`:

```ts
  const markComplete = React.useCallback(() => {
    if (isCompleted) return;
    void reportProgress(course.id, curLessonId, { completed: true }).then((status) => {
      if (status !== "completed") return;
      setLessonStatus(course.id, curLessonId, "completed");
      showToast("Lesson completed");
      if (autoAdvance) {
        window.setTimeout(() => goNext(true), AUTO_ADVANCE_MS);
      }
    });
  }, [isCompleted, course.id, curLessonId, setLessonStatus, showToast, autoAdvance, goNext]);
```

(`isCompleted` is derived above the callback already; the button now does nothing once completed — the domain has no un-complete.)

The dashboard keeps reading `completionByCourse` as-is (client state until a course page has seeded it) — out of this task's scope.

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm --filter student build` (the workspace is named `student`).
Expected: PASS. Then manually: `pnpm dev`, open a course as a student, mark a lesson complete → toast, reload → state persists (hydration), complete all lessons → course record + events rows in `outbox`/`progress_records`.

- [ ] **Step 7: Commit**

```bash
git add apps/student/src
git commit -m "feat(student): report progress to the API, hydrate completion"
```

---

### Task 8: Full verification sweep

- [ ] **Step 1: Whole-repo gates**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all PASS. Lint specifically guards the new `core/progress` → `core/content/index.js` import (legal) and catches any deep-import slips.

- [ ] **Step 2: SDK staleness check**

Run: `pnpm gen:sdk && git diff --exit-code packages/sdk`
Expected: no diff (regeneration is idempotent against the committed output).

- [ ] **Step 3: Commit anything outstanding**

```bash
git status --short
# only intentional changes; commit stragglers with a fitting message if any
```
