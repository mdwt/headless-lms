// modules — Drizzle repository (implements the core outbound port). Curriculum
// structure under a course, org-scoped. Every method returns the course's full
// ordered module list (modules by `seq`, each with `items` by `seq`), so a
// private `list` runs at the end of every mutation within the same transaction.
//
// `module_items` is a thin orderable LINK table: each row places ONE lesson OR
// ONE assessment in a module at a `seq`. The content lives in the `lessons` /
// `assessments` tables; lesson media is the `lesson_assets` join. `saveItem`
// upserts BOTH the content entity and its link row; `deleteItem` / `deleteModule`
// remove the link(s) first, then the orphaned content.
import { eq, and, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { ModulesRepository } from "../../../core/courses/ports.js";
import type {
  Module,
  ModuleItem,
  Lesson,
  Assessment,
  LessonType,
  AssessmentType,
  SaveItemInput,
} from "../../../core/courses/modules.js";
import {
  modules,
  moduleItems,
  lessons,
  assessments,
  lessonAssets,
} from "../schema/index.js";

/** Transaction executor — the same query surface as the root db. */
type Tx = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

type LessonRow = typeof lessons.$inferSelect;
type AssessmentRow = typeof assessments.$inferSelect;

function mapLesson(row: LessonRow, assetIds: string[]): Lesson {
  return {
    id: row.id,
    type: row.type as LessonType,
    title: row.title,
    settings: row.settings ?? null,
    assetIds,
  };
}

function mapAssessment(row: AssessmentRow): Assessment {
  const a: Assessment = {
    id: row.id,
    type: row.type as AssessmentType,
    title: row.title,
    published: row.published,
  };
  if (row.questionCount !== null) a.questionCount = row.questionCount;
  if (row.pointsPossible !== null) a.pointsPossible = row.pointsPossible;
  return a;
}

export class DrizzleModulesRepository implements ModulesRepository {
  constructor(private readonly db: NodePgDatabase) {}

  // --- reads -------------------------------------------------------------

  listForCourse(orgId: string, courseId: string): Promise<Module[]> {
    return this.db.transaction((tx) => this.list(tx, orgId, courseId));
  }

  /** The course's full ordered module list, each module's items ordered too. */
  private async list(tx: Tx, orgId: string, courseId: string): Promise<Module[]> {
    const moduleRows = await tx
      .select()
      .from(modules)
      .where(and(eq(modules.orgId, orgId), eq(modules.courseId, courseId)))
      .orderBy(modules.seq);

    const moduleIds = moduleRows.map((m) => m.id);
    const itemRows = moduleIds.length
      ? await tx
          .select()
          .from(moduleItems)
          .where(and(eq(moduleItems.orgId, orgId), inArray(moduleItems.moduleId, moduleIds)))
          .orderBy(moduleItems.seq)
      : [];

    // Resolve the linked content in bulk.
    const lessonIds = itemRows.flatMap((r) => (r.lessonId ? [r.lessonId] : []));
    const assessmentIds = itemRows.flatMap((r) => (r.assessmentId ? [r.assessmentId] : []));

    const lessonRows = lessonIds.length
      ? await tx
          .select()
          .from(lessons)
          .where(and(eq(lessons.orgId, orgId), inArray(lessons.id, lessonIds)))
      : [];
    const assessmentRows = assessmentIds.length
      ? await tx
          .select()
          .from(assessments)
          .where(and(eq(assessments.orgId, orgId), inArray(assessments.id, assessmentIds)))
      : [];
    const assetLinkRows = lessonIds.length
      ? await tx
          .select()
          .from(lessonAssets)
          .where(and(eq(lessonAssets.orgId, orgId), inArray(lessonAssets.lessonId, lessonIds)))
          .orderBy(lessonAssets.seq)
      : [];

    const assetIdsByLesson = new Map<string, string[]>();
    for (const row of assetLinkRows) {
      const arr = assetIdsByLesson.get(row.lessonId) ?? [];
      arr.push(row.assetId);
      assetIdsByLesson.set(row.lessonId, arr);
    }
    const lessonById = new Map<string, Lesson>();
    for (const row of lessonRows) {
      lessonById.set(row.id, mapLesson(row, assetIdsByLesson.get(row.id) ?? []));
    }
    const assessmentById = new Map<string, Assessment>();
    for (const row of assessmentRows) {
      assessmentById.set(row.id, mapAssessment(row));
    }

    const itemsByModule = new Map<string, ModuleItem[]>();
    for (const row of itemRows) {
      const list = itemsByModule.get(row.moduleId) ?? [];
      if (row.kind === "assessment" && row.assessmentId) {
        const assessment = assessmentById.get(row.assessmentId);
        if (assessment) {
          list.push({
            id: row.id,
            moduleId: row.moduleId,
            seq: row.seq,
            kind: "assessment",
            assessmentId: row.assessmentId,
            assessment,
          });
        }
      } else if (row.kind === "lesson" && row.lessonId) {
        const lesson = lessonById.get(row.lessonId);
        if (lesson) {
          list.push({
            id: row.id,
            moduleId: row.moduleId,
            seq: row.seq,
            kind: "lesson",
            lessonId: row.lessonId,
            lesson,
          });
        }
      }
      itemsByModule.set(row.moduleId, list);
    }

    return moduleRows.map((m) => ({
      id: m.id,
      courseId: m.courseId,
      title: m.title,
      seq: m.seq,
      items: itemsByModule.get(m.id) ?? [],
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
    if (!row) throw new Error("module not found in course");
  }

  /** Replace a lesson's ordered asset links with `assetIds`. */
  private async replaceLessonAssets(
    tx: Tx,
    orgId: string,
    lessonId: string,
    assetIds: string[],
  ): Promise<void> {
    await tx
      .delete(lessonAssets)
      .where(and(eq(lessonAssets.orgId, orgId), eq(lessonAssets.lessonId, lessonId)));
    if (assetIds.length) {
      await tx.insert(lessonAssets).values(
        assetIds.map((assetId, i) => ({ orgId, lessonId, assetId, seq: i })),
      );
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

      // Gather the content linked by this module's items, drop the links first
      // (they FK the content), then the orphaned lessons/assessments.
      const itemRows = await tx
        .select()
        .from(moduleItems)
        .where(and(eq(moduleItems.orgId, orgId), eq(moduleItems.moduleId, moduleId)));
      const lessonIds = itemRows.flatMap((r) => (r.lessonId ? [r.lessonId] : []));
      const assessmentIds = itemRows.flatMap((r) => (r.assessmentId ? [r.assessmentId] : []));

      await tx
        .delete(moduleItems)
        .where(and(eq(moduleItems.orgId, orgId), eq(moduleItems.moduleId, moduleId)));

      if (lessonIds.length) {
        await tx
          .delete(lessonAssets)
          .where(and(eq(lessonAssets.orgId, orgId), inArray(lessonAssets.lessonId, lessonIds)));
        await tx
          .delete(lessons)
          .where(and(eq(lessons.orgId, orgId), inArray(lessons.id, lessonIds)));
      }
      if (assessmentIds.length) {
        await tx
          .delete(assessments)
          .where(and(eq(assessments.orgId, orgId), inArray(assessments.id, assessmentIds)));
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

  // --- item mutations ----------------------------------------------------

  reorderItems(
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
          .update(moduleItems)
          .set({ seq: -(i + 1) })
          .where(
            and(
              eq(moduleItems.orgId, orgId),
              eq(moduleItems.moduleId, moduleId),
              eq(moduleItems.id, orderedIds[i]!),
            ),
          );
      }
      for (let i = 0; i < orderedIds.length; i++) {
        await tx
          .update(moduleItems)
          .set({ seq: i })
          .where(
            and(
              eq(moduleItems.orgId, orgId),
              eq(moduleItems.moduleId, moduleId),
              eq(moduleItems.id, orderedIds[i]!),
            ),
          );
      }
      return this.list(tx, orgId, courseId);
    });
  }

  saveItem(
    orgId: string,
    courseId: string,
    moduleId: string,
    input: SaveItemInput,
    itemId?: string,
  ): Promise<Module[]> {
    return this.db.transaction(async (tx) => {
      await this.assertModule(tx, orgId, courseId, moduleId);

      if (itemId) {
        const [link] = await tx
          .select()
          .from(moduleItems)
          .where(
            and(
              eq(moduleItems.orgId, orgId),
              eq(moduleItems.id, itemId),
              eq(moduleItems.moduleId, moduleId),
            ),
          )
          .limit(1);
        if (!link) throw new Error("module item not found in module");
        await this.updateItem(tx, orgId, link, input);
      } else {
        await this.insertItem(tx, orgId, moduleId, input);
      }

      return this.list(tx, orgId, courseId);
    });
  }

  /** Insert a new content entity + a link row at the module's next seq. */
  private async insertItem(
    tx: Tx,
    orgId: string,
    moduleId: string,
    input: SaveItemInput,
  ): Promise<void> {
    const existing = await tx
      .select({ seq: moduleItems.seq })
      .from(moduleItems)
      .where(and(eq(moduleItems.orgId, orgId), eq(moduleItems.moduleId, moduleId)));
    const nextSeq = existing.reduce((max, r) => Math.max(max, r.seq), -1) + 1;

    if (input.kind === "lesson") {
      const [ins] = await tx
        .insert(lessons)
        .values({
          orgId,
          type: input.type,
          title: input.title,
          settings: input.settings ?? null,
        })
        .returning({ id: lessons.id });
      if (!ins) throw new Error("failed to insert lesson");
      await this.replaceLessonAssets(tx, orgId, ins.id, input.assetIds ?? []);
      await tx
        .insert(moduleItems)
        .values({ orgId, moduleId, seq: nextSeq, kind: "lesson", lessonId: ins.id });
    } else {
      const [ins] = await tx
        .insert(assessments)
        .values({
          orgId,
          type: input.type,
          title: input.title,
          questionCount: input.questionCount ?? null,
          pointsPossible: input.pointsPossible ?? null,
          published: input.published ?? false,
        })
        .returning({ id: assessments.id });
      if (!ins) throw new Error("failed to insert assessment");
      await tx
        .insert(moduleItems)
        .values({ orgId, moduleId, seq: nextSeq, kind: "assessment", assessmentId: ins.id });
    }
  }

  /**
   * Update the content behind an existing link. When the kind matches, update
   * the entity in place. When it flips (lesson↔assessment), create the new
   * entity, re-point the link, and drop the old entity.
   */
  private async updateItem(
    tx: Tx,
    orgId: string,
    link: typeof moduleItems.$inferSelect,
    input: SaveItemInput,
  ): Promise<void> {
    if (input.kind === "lesson") {
      if (link.kind === "lesson" && link.lessonId) {
        const lessonId = link.lessonId;
        await tx
          .update(lessons)
          .set({ type: input.type, title: input.title, settings: input.settings ?? null })
          .where(and(eq(lessons.orgId, orgId), eq(lessons.id, lessonId)));
        await this.replaceLessonAssets(tx, orgId, lessonId, input.assetIds ?? []);
      } else {
        const [ins] = await tx
          .insert(lessons)
          .values({
            orgId,
            type: input.type,
            title: input.title,
            settings: input.settings ?? null,
          })
          .returning({ id: lessons.id });
        if (!ins) throw new Error("failed to insert lesson");
        await this.replaceLessonAssets(tx, orgId, ins.id, input.assetIds ?? []);
        await tx
          .update(moduleItems)
          .set({ kind: "lesson", lessonId: ins.id, assessmentId: null })
          .where(and(eq(moduleItems.orgId, orgId), eq(moduleItems.id, link.id)));
        if (link.assessmentId) {
          await tx
            .delete(assessments)
            .where(and(eq(assessments.orgId, orgId), eq(assessments.id, link.assessmentId)));
        }
      }
    } else {
      if (link.kind === "assessment" && link.assessmentId) {
        const assessmentId = link.assessmentId;
        await tx
          .update(assessments)
          .set({
            type: input.type,
            title: input.title,
            questionCount: input.questionCount ?? null,
            pointsPossible: input.pointsPossible ?? null,
            published: input.published ?? false,
          })
          .where(and(eq(assessments.orgId, orgId), eq(assessments.id, assessmentId)));
      } else {
        const [ins] = await tx
          .insert(assessments)
          .values({
            orgId,
            type: input.type,
            title: input.title,
            questionCount: input.questionCount ?? null,
            pointsPossible: input.pointsPossible ?? null,
            published: input.published ?? false,
          })
          .returning({ id: assessments.id });
        if (!ins) throw new Error("failed to insert assessment");
        await tx
          .update(moduleItems)
          .set({ kind: "assessment", assessmentId: ins.id, lessonId: null })
          .where(and(eq(moduleItems.orgId, orgId), eq(moduleItems.id, link.id)));
        if (link.lessonId) {
          const oldLessonId = link.lessonId;
          await tx
            .delete(lessonAssets)
            .where(and(eq(lessonAssets.orgId, orgId), eq(lessonAssets.lessonId, oldLessonId)));
          await tx
            .delete(lessons)
            .where(and(eq(lessons.orgId, orgId), eq(lessons.id, oldLessonId)));
        }
      }
    }
  }

  deleteItem(
    orgId: string,
    courseId: string,
    moduleId: string,
    itemId: string,
  ): Promise<Module[]> {
    return this.db.transaction(async (tx) => {
      await this.assertModule(tx, orgId, courseId, moduleId);

      const [link] = await tx
        .select()
        .from(moduleItems)
        .where(
          and(
            eq(moduleItems.orgId, orgId),
            eq(moduleItems.id, itemId),
            eq(moduleItems.moduleId, moduleId),
          ),
        )
        .limit(1);

      // Drop the link first (it FKs the content), then the orphaned content.
      await tx
        .delete(moduleItems)
        .where(
          and(
            eq(moduleItems.orgId, orgId),
            eq(moduleItems.id, itemId),
            eq(moduleItems.moduleId, moduleId),
          ),
        );

      if (link?.lessonId) {
        const lessonId = link.lessonId;
        await tx
          .delete(lessonAssets)
          .where(and(eq(lessonAssets.orgId, orgId), eq(lessonAssets.lessonId, lessonId)));
        await tx.delete(lessons).where(and(eq(lessons.orgId, orgId), eq(lessons.id, lessonId)));
      }
      if (link?.assessmentId) {
        const assessmentId = link.assessmentId;
        await tx
          .delete(assessments)
          .where(and(eq(assessments.orgId, orgId), eq(assessments.id, assessmentId)));
      }

      return this.list(tx, orgId, courseId);
    });
  }
}
