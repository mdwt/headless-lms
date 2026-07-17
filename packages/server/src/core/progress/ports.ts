// progress context — ports.
// Inbound: the use-case interface the service implements.
// Outbound: the persistence contract the repository fulfils.
import type { ProgressRecord } from "./model.js";
import type { ProgressTarget, RecordPositionInput } from "./types.js";

// Inbound port (use cases the service exposes).
export interface ProgressService {
  /** Open a target: create the record on first touch, idempotent thereafter. */
  recordStart(orgId: string, target: ProgressTarget): Promise<ProgressRecord>;
  /** Update the opaque resume payload of an in-progress target. */
  recordPosition(orgId: string, input: RecordPositionInput): Promise<ProgressRecord>;
  /** Mark a target complete (sets completedAt). */
  recordCompletion(orgId: string, target: ProgressTarget): Promise<ProgressRecord>;
  /** Fetch the record for a single (student, target), or null. */
  get(orgId: string, target: ProgressTarget): Promise<ProgressRecord | null>;
}

// Outbound port (persistence contract the repository fulfils).
export interface ProgressRepository {
  insert(orgId: string, record: ProgressRecord): Promise<ProgressRecord>;
  /** Scoped to the org — returns the record for the unique (student, target) key, or null. */
  findByTarget(orgId: string, target: ProgressTarget): Promise<ProgressRecord | null>;
  update(
    orgId: string,
    id: string,
    patch: Partial<Pick<ProgressRecord, "position" | "completedAt">>,
  ): Promise<ProgressRecord | null>;
}
