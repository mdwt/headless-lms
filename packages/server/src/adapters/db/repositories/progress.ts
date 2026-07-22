// progress — Drizzle repository (implements the core outbound port).
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ProgressRepository } from '../../../core/progress/ports.js';
import type { ProgressRecord, ProgressTargetType } from '../../../core/progress/model.js';
import type { ProgressTarget } from '../../../core/progress/types.js';
import { progressRecords } from '../schema/progress.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';

type Row = typeof progressRecords.$inferSelect;

function toRecord(row: Row): ProgressRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    studentId: row.studentId,
    targetType: row.targetType as ProgressTargetType,
    targetId: row.targetId,
    startedAt: row.startedAt.toISOString(),
    position: row.position ?? null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export class DrizzleProgressRepository implements ProgressRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async insert(orgId: string, record: ProgressRecord): Promise<ProgressRecord> {
    const [row] = await this.db
      .insert(progressRecords)
      .values({
        id: record.id,
        orgId,
        studentId: record.studentId,
        targetType: record.targetType,
        targetId: record.targetId,
        startedAt: new Date(record.startedAt),
        position: record.position ?? null,
        completedAt: record.completedAt ? new Date(record.completedAt) : null,
      })
      .returning();
    if (!row) {
      throw new Error('failed to insert progress record');
    }
    return toRecord(row);
  }

  async findByTarget(orgId: string, target: ProgressTarget): Promise<ProgressRecord | null> {
    const [row] = await this.db
      .select()
      .from(progressRecords)
      .where(
        and(
          eq(progressRecords.orgId, orgId),
          eq(progressRecords.studentId, target.studentId),
          eq(progressRecords.targetType, target.targetType),
          eq(progressRecords.targetId, target.targetId),
        ),
      )
      .limit(1);
    return row ? toRecord(row) : null;
  }

  async update(
    orgId: string,
    id: string,
    patch: Partial<Pick<ProgressRecord, 'position' | 'completedAt'>>,
  ): Promise<ProgressRecord | null> {
    const [row] = await this.db
      .update(progressRecords)
      .set({
        ...('position' in patch ? { position: patch.position ?? null } : {}),
        ...('completedAt' in patch
          ? { completedAt: patch.completedAt ? new Date(patch.completedAt) : null }
          : {}),
      })
      .where(and(eq(progressRecords.orgId, orgId), eq(progressRecords.id, id)))
      .returning();
    return row ? toRecord(row) : null;
  }
}
