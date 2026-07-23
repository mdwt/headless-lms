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
