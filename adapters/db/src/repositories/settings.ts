import { and, eq } from "drizzle-orm";
import type { Setting } from "@headless-lms/core/schemas";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { SettingsRecord, SettingsRepository } from "@headless-lms/core/shared/settings";
import { settings } from "../schema/settings.js";
import type { Logger } from "@headless-lms/core/types";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { translateDbErrors } from "./pg-errors.js";

type Row = typeof settings.$inferSelect;

function toRecord(row: Row): SettingsRecord {
  return {
    namespace: row.namespace,
    scopeId: row.scopeId,
    value: row.value,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursive merge of a partial patch into a stored value: a patch cannot
 * clobber sibling keys at any depth, only the leaves it names. Arrays and
 * scalars are replaced outright — merging arrays element-wise has no meaning
 * for settings, and null is a value a caller may legitimately store.
 * Exported for tests.
 */
export function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch;
  }
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    merged[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return merged;
}

export class DrizzleSettingsRepository implements SettingsRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async find(orgId: string, scopeId: string, namespace?: string): Promise<SettingsRecord[]> {
    const baseConditions = [eq(settings.orgId, orgId), eq(settings.scopeId, scopeId)];
    const where = namespace
      ? and(...baseConditions, eq(settings.namespace, namespace))
      : and(...baseConditions);

    const rows = await this.db.select().from(settings).where(where);
    return rows.map(toRecord);
  }

  async patch(
    orgId: string,
    namespace: string,
    scopeId: string,
    patch: Record<string, unknown>,
  ): Promise<SettingsRecord> {
    const key = and(
      eq(settings.orgId, orgId),
      eq(settings.namespace, namespace),
      eq(settings.scopeId, scopeId),
    );

    // The merge happens in JS, so the read and the write must be one atomic
    // unit or concurrent patches would clobber each other's sibling keys:
    // SELECT ... FOR UPDATE holds the row for the rest of the transaction.
    const row = await this.db.transaction(async (tx) => {
      let [existing] = await tx.select().from(settings).where(key).for("update");

      if (!existing) {
        const [inserted] = await tx
          .insert(settings)
          .values({ orgId, namespace, scopeId, value: patch as Setting["value"] })
          .onConflictDoNothing()
          .returning();
        if (inserted) {
          return inserted;
        }
        // Lost the race: a concurrent transaction inserted the row and has
        // committed by the time onConflictDoNothing returned. Take the lock
        // and merge onto what it wrote.
        [existing] = await tx.select().from(settings).where(key).for("update");
        if (!existing) {
          throw new Error("settings patch: row vanished mid-transaction");
        }
      }

      const [updated] = await tx
        .update(settings)
        .set({ value: deepMerge(existing.value, patch) as Setting["value"], updatedAt: new Date() })
        .where(key)
        .returning();
      return updated;
    });

    if (!row) {
      throw new Error("settings patch returned no row");
    }
    this.logger.debug("settings.patch", { orgId, namespace, scopeId });
    return toRecord(row);
  }
}
translateDbErrors(DrizzleSettingsRepository);
