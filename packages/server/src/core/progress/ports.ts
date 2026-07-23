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
