// progress context — service implementation (inbound port).
// Owns the record lifecycle (start → position → completion) and enforces org
// isolation by scoping every lookup to the caller's org. One record per
// (student, target); start is idempotent, position/completion upsert on the
// existing record. Percentage/resume are derived by readers, never stored here.
import { genId } from "../shared/id.js";
import type { ProgressRecord } from "./model.js";
import type { ProgressRepository, ProgressService } from "./ports.js";
import type { ProgressTarget, RecordPositionInput } from "./types.js";
import type { Logger } from "../shared/ports.js";
import { noopLogger } from "../shared/logger.js";

export class ProgressServiceImpl implements ProgressService {
  constructor(
    private readonly repo: ProgressRepository,
    private readonly now: () => string,
    private readonly logger: Logger = noopLogger,
  ) {}

  async recordStart(orgId: string, target: ProgressTarget): Promise<ProgressRecord> {
    const existing = await this.repo.findByTarget(orgId, target);
    if (existing) return existing;
    const record = await this.repo.insert(orgId, {
      id: genId("progress"),
      orgId,
      studentId: target.studentId,
      targetType: target.targetType,
      targetId: target.targetId,
      startedAt: this.now(),
      position: null,
      completedAt: null,
    });
    this.logger.info("progress started", {
      orgId,
      studentId: target.studentId,
      targetType: target.targetType,
      targetId: target.targetId,
    });
    return record;
  }

  async recordPosition(orgId: string, input: RecordPositionInput): Promise<ProgressRecord> {
    const record = await this.recordStart(orgId, input);
    const updated = await this.repo.update(orgId, record.id, { position: input.position });
    if (!updated) throw new Error("progress record vanished during position update");
    this.logger.debug("position recorded", { orgId, recordId: record.id });
    return updated;
  }

  async recordCompletion(orgId: string, target: ProgressTarget): Promise<ProgressRecord> {
    const record = await this.recordStart(orgId, target);
    const updated = await this.repo.update(orgId, record.id, { completedAt: this.now() });
    if (!updated) throw new Error("progress record vanished during completion update");
    this.logger.info("progress completed", { orgId, recordId: record.id });
    return updated;
  }

  get(orgId: string, target: ProgressTarget): Promise<ProgressRecord | null> {
    return this.repo.findByTarget(orgId, target);
  }
}
