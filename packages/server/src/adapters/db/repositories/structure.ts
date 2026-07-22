// content structure — Drizzle repository (implements the core outbound
// `ContentStructureRepository` port). Modules + activities under a course,
// org-scoped. Every method returns the course's full ordered module list
// (modules by `seq`, each with its `activities` by `seq`), so a private `list`
// runs at the end of every mutation within the same transaction.
//
// An Activity is the leaf, sitting directly in a module: a `seq` and an opaque
// `settings` blob. Its media is the many-to-many `activity_assets` join.
// `saveActivity` upserts the activity row and replaces its asset links;
// `deleteActivity` / `deleteModule` drop the asset links first (they FK the
// activity), then the activity rows.
import { eq, and, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { CourseRepository } from '../../../core/content/ports.js';
import type { Module, Activity, SaveActivityInput } from '../../../core/content/model.js';
import { modules, activities, activityAssets } from '../schema/content.js';
import type { Tx } from '../index.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';

export class DrizzleContentStructureRepository implements CourseRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  // --- reads -------------------------------------------------------------

  listForCourse(orgId: string, courseId: string): Promise<Module[]> {
    return this.db.transaction((tx) => this.list(tx, orgId, courseId));
  }

  /** The course's full ordered module list, each module's activities ordered too. */
  private async list(tx: Tx, orgId: string, courseId: string): Promise<Module[]> {
    const moduleRows = await tx
      .select()
      .from(modules)
      .where(and(eq(modules.orgId, orgId), eq(modules.courseId, courseId)))
      .orderBy(modules.seq);

    const moduleIds = moduleRows.map((m) => m.id);
    const activityRows = moduleIds.length
      ? await tx
          .select()
          .from(activities)
          .where(and(eq(activities.orgId, orgId), inArray(activities.moduleId, moduleIds)))
          .orderBy(activities.seq)
      : [];

    const activityIds = activityRows.map((a) => a.id);
    const assetLinkRows = activityIds.length
      ? await tx
          .select()
          .from(activityAssets)
          .where(
            and(eq(activityAssets.orgId, orgId), inArray(activityAssets.activityId, activityIds)),
          )
          .orderBy(activityAssets.seq)
      : [];

    const assetIdsByActivity = new Map<string, string[]>();
    for (const row of assetLinkRows) {
      const arr = assetIdsByActivity.get(row.activityId) ?? [];
      arr.push(row.assetId);
      assetIdsByActivity.set(row.activityId, arr);
    }

    const activitiesByModule = new Map<string, Activity[]>();
    for (const row of activityRows) {
      const list = activitiesByModule.get(row.moduleId) ?? [];
      list.push({
        id: row.id,
        moduleId: row.moduleId,
        seq: row.seq,
        settings: row.settings ?? null,
        assetIds: assetIdsByActivity.get(row.id) ?? [],
      });
      activitiesByModule.set(row.moduleId, list);
    }

    return moduleRows.map((m) => ({
      id: m.id,
      courseId: m.courseId,
      title: m.title,
      seq: m.seq,
      activities: activitiesByModule.get(m.id) ?? [],
    }));
  }

  /** Assert the module belongs to the org + course; throw otherwise. */
  private async assertModule(
    tx: Tx,
    orgId: string,
    courseId: string,
    moduleId: string,
  ): Promise<void> {
    const [row] = await tx
      .select({ id: modules.id })
      .from(modules)
      .where(
        and(eq(modules.orgId, orgId), eq(modules.id, moduleId), eq(modules.courseId, courseId)),
      )
      .limit(1);
    if (!row) {
      throw new Error('module not found in course');
    }
  }

  /** Replace an activity's ordered asset links with `assetIds`. */
  private async replaceActivityAssets(
    tx: Tx,
    orgId: string,
    activityId: string,
    assetIds: string[],
  ): Promise<void> {
    await tx
      .delete(activityAssets)
      .where(and(eq(activityAssets.orgId, orgId), eq(activityAssets.activityId, activityId)));
    if (assetIds.length) {
      await tx
        .insert(activityAssets)
        .values(assetIds.map((assetId, i) => ({ orgId, activityId, assetId, seq: i })));
    }
  }

  // --- module mutations --------------------------------------------------

  createModule(orgId: string, courseId: string, title: string): Promise<Module[]> {
    return this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ seq: modules.seq })
        .from(modules)
        .where(and(eq(modules.orgId, orgId), eq(modules.courseId, courseId)));
      const nextSeq = existing.reduce((max, r) => Math.max(max, r.seq), -1) + 1;
      await tx.insert(modules).values({ orgId, courseId, title, seq: nextSeq });
      return this.list(tx, orgId, courseId);
    });
  }

  updateModule(
    orgId: string,
    courseId: string,
    moduleId: string,
    title: string,
  ): Promise<Module[]> {
    return this.db.transaction(async (tx) => {
      await this.assertModule(tx, orgId, courseId, moduleId);
      await tx
        .update(modules)
        .set({ title })
        .where(
          and(eq(modules.orgId, orgId), eq(modules.id, moduleId), eq(modules.courseId, courseId)),
        );
      return this.list(tx, orgId, courseId);
    });
  }

  deleteModule(orgId: string, courseId: string, moduleId: string): Promise<Module[]> {
    return this.db.transaction(async (tx) => {
      await this.assertModule(tx, orgId, courseId, moduleId);

      // Drop the module's activities: their asset links first (they FK the
      // activity), then the activity rows, then the module.
      const activityRows = await tx
        .select({ id: activities.id })
        .from(activities)
        .where(and(eq(activities.orgId, orgId), eq(activities.moduleId, moduleId)));
      const activityIds = activityRows.map((a) => a.id);

      if (activityIds.length) {
        await tx
          .delete(activityAssets)
          .where(
            and(eq(activityAssets.orgId, orgId), inArray(activityAssets.activityId, activityIds)),
          );
        await tx
          .delete(activities)
          .where(and(eq(activities.orgId, orgId), eq(activities.moduleId, moduleId)));
      }

      await tx
        .delete(modules)
        .where(
          and(eq(modules.orgId, orgId), eq(modules.id, moduleId), eq(modules.courseId, courseId)),
        );
      return this.list(tx, orgId, courseId);
    });
  }

  reorderModules(orgId: string, courseId: string, orderedIds: string[]): Promise<Module[]> {
    return this.db.transaction(async (tx) => {
      // Two-phase to dodge the unique(org_id, id) is fine, but modules have no
      // unique(seq); still, park then assign to stay consistent with activities.
      for (let i = 0; i < orderedIds.length; i++) {
        await tx
          .update(modules)
          .set({ seq: i })
          .where(
            and(
              eq(modules.orgId, orgId),
              eq(modules.courseId, courseId),
              eq(modules.id, orderedIds[i]!),
            ),
          );
      }
      return this.list(tx, orgId, courseId);
    });
  }

  // --- activity mutations ------------------------------------------------

  reorderActivities(
    orgId: string,
    courseId: string,
    moduleId: string,
    orderedIds: string[],
  ): Promise<Module[]> {
    return this.db.transaction(async (tx) => {
      await this.assertModule(tx, orgId, courseId, moduleId);
      // Two-phase to dodge the unique(org_id, module_id, seq) constraint mid-swap:
      // park rows at negative seqs, then assign the final 0..n-1.
      for (let i = 0; i < orderedIds.length; i++) {
        await tx
          .update(activities)
          .set({ seq: -(i + 1) })
          .where(
            and(
              eq(activities.orgId, orgId),
              eq(activities.moduleId, moduleId),
              eq(activities.id, orderedIds[i]!),
            ),
          );
      }
      for (let i = 0; i < orderedIds.length; i++) {
        await tx
          .update(activities)
          .set({ seq: i })
          .where(
            and(
              eq(activities.orgId, orgId),
              eq(activities.moduleId, moduleId),
              eq(activities.id, orderedIds[i]!),
            ),
          );
      }
      return this.list(tx, orgId, courseId);
    });
  }

  saveActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    input: SaveActivityInput,
    activityId?: string,
  ): Promise<Module[]> {
    return this.db.transaction(async (tx) => {
      await this.assertModule(tx, orgId, courseId, moduleId);

      if (activityId) {
        const [existing] = await tx
          .select({ id: activities.id })
          .from(activities)
          .where(
            and(
              eq(activities.orgId, orgId),
              eq(activities.id, activityId),
              eq(activities.moduleId, moduleId),
            ),
          )
          .limit(1);
        if (!existing) {
          throw new Error('activity not found in module');
        }

        await tx
          .update(activities)
          .set({ settings: input.settings ?? null })
          .where(and(eq(activities.orgId, orgId), eq(activities.id, activityId)));
        if (input.assetIds !== undefined) {
          await this.replaceActivityAssets(tx, orgId, activityId, input.assetIds);
        }
      } else {
        const existing = await tx
          .select({ seq: activities.seq })
          .from(activities)
          .where(and(eq(activities.orgId, orgId), eq(activities.moduleId, moduleId)));
        const nextSeq = existing.reduce((max, r) => Math.max(max, r.seq), -1) + 1;

        const [ins] = await tx
          .insert(activities)
          .values({ orgId, moduleId, seq: nextSeq, settings: input.settings ?? null })
          .returning({ id: activities.id });
        if (!ins) {
          throw new Error('failed to insert activity');
        }
        await this.replaceActivityAssets(tx, orgId, ins.id, input.assetIds ?? []);
      }

      return this.list(tx, orgId, courseId);
    });
  }

  deleteActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    activityId: string,
  ): Promise<Module[]> {
    return this.db.transaction(async (tx) => {
      await this.assertModule(tx, orgId, courseId, moduleId);

      // Drop the asset links first (they FK the activity), then the activity.
      await tx
        .delete(activityAssets)
        .where(and(eq(activityAssets.orgId, orgId), eq(activityAssets.activityId, activityId)));
      await tx
        .delete(activities)
        .where(
          and(
            eq(activities.orgId, orgId),
            eq(activities.id, activityId),
            eq(activities.moduleId, moduleId),
          ),
        );

      return this.list(tx, orgId, courseId);
    });
  }
}
