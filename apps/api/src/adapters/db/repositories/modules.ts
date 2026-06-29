// modules — Drizzle repository (implements the core outbound port). Curriculum
// structure under a course, org-scoped. Every method returns the course's full
// ordered module list (modules by `order`, each with `items` by `order`), so a
// private `list` runs at the end of every mutation within the same transaction.
import { eq, and, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { ModulesRepository } from "../../../core/modules/ports.js";
import type {
  Module,
  ModuleItem,
  Lesson,
  Assessment,
  LessonType,
  AssessmentType,
  SaveItemInput,
} from "../../../core/modules/model.js";
import { modules, moduleItems } from "../schema/index.js";

/** Transaction executor — the same query surface as the root db. */
type Tx = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

type ItemRow = typeof moduleItems.$inferSelect;

function mapItem(row: ItemRow): ModuleItem {
  if (row.kind === "assessment") {
    const item: Assessment = {
      id: row.id,
      moduleId: row.moduleId,
      kind: "assessment",
      title: row.title,
      order: row.order,
      type: row.type as AssessmentType,
      published: row.published,
    };
    if (row.questionCount !== null) item.questionCount = row.questionCount;
    if (row.pointsPossible !== null) item.pointsPossible = row.pointsPossible;
    return item;
  }
  const item: Lesson = {
    id: row.id,
    moduleId: row.moduleId,
    kind: "lesson",
    title: row.title,
    order: row.order,
    type: row.type as LessonType,
    published: row.published,
  };
  if (row.durationLabel !== null) item.durationLabel = row.durationLabel;
  if (row.assetId !== null) item.assetId = row.assetId;
  return item;
}

/** Map a SaveItemInput onto the module_items columns (clearing the other kind's). */
function itemColumns(input: SaveItemInput) {
  if (input.kind === "lesson") {
    return {
      kind: "lesson" as const,
      title: input.title,
      type: input.type,
      durationLabel: input.durationLabel ?? null,
      assetId: input.assetId ?? null,
      questionCount: null,
      pointsPossible: null,
      published: input.published ?? false,
    };
  }
  return {
    kind: "assessment" as const,
    title: input.title,
    type: input.type,
    durationLabel: null,
    assetId: null,
    questionCount: input.questionCount ?? null,
    pointsPossible: input.pointsPossible ?? null,
    published: input.published ?? false,
  };
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
      .orderBy(modules.order);

    const moduleIds = moduleRows.map((m) => m.id);
    const itemRows = moduleIds.length
      ? await tx
          .select()
          .from(moduleItems)
          .where(and(eq(moduleItems.orgId, orgId), inArray(moduleItems.moduleId, moduleIds)))
          .orderBy(moduleItems.order)
      : [];

    const itemsByModule = new Map<string, ModuleItem[]>();
    for (const row of itemRows) {
      const list = itemsByModule.get(row.moduleId) ?? [];
      list.push(mapItem(row));
      itemsByModule.set(row.moduleId, list);
    }

    return moduleRows.map((m) => ({
      id: m.id,
      courseId: m.courseId,
      title: m.title,
      order: m.order,
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

  // --- module mutations --------------------------------------------------

  createModule(orgId: string, courseId: string, title: string): Promise<Module[]> {
    return this.db.transaction(async (tx) => {
      const existing = await tx
        .select({ order: modules.order })
        .from(modules)
        .where(and(eq(modules.orgId, orgId), eq(modules.courseId, courseId)));
      const nextOrder = existing.reduce((max, r) => Math.max(max, r.order), -1) + 1;
      await tx.insert(modules).values({ orgId, courseId, title, order: nextOrder });
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
      await tx
        .delete(moduleItems)
        .where(and(eq(moduleItems.orgId, orgId), eq(moduleItems.moduleId, moduleId)));
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
          .set({ order: i })
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
      for (let i = 0; i < orderedIds.length; i++) {
        await tx
          .update(moduleItems)
          .set({ order: i })
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
      const cols = itemColumns(input);
      if (itemId) {
        await tx
          .update(moduleItems)
          .set(cols)
          .where(
            and(
              eq(moduleItems.orgId, orgId),
              eq(moduleItems.id, itemId),
              eq(moduleItems.moduleId, moduleId),
            ),
          );
      } else {
        const existing = await tx
          .select({ order: moduleItems.order })
          .from(moduleItems)
          .where(and(eq(moduleItems.orgId, orgId), eq(moduleItems.moduleId, moduleId)));
        const nextOrder = existing.reduce((max, r) => Math.max(max, r.order), -1) + 1;
        await tx.insert(moduleItems).values({ orgId, moduleId, order: nextOrder, ...cols });
      }
      return this.list(tx, orgId, courseId);
    });
  }

  deleteItem(
    orgId: string,
    courseId: string,
    moduleId: string,
    itemId: string,
  ): Promise<Module[]> {
    return this.db.transaction(async (tx) => {
      await this.assertModule(tx, orgId, courseId, moduleId);
      await tx
        .delete(moduleItems)
        .where(
          and(
            eq(moduleItems.orgId, orgId),
            eq(moduleItems.id, itemId),
            eq(moduleItems.moduleId, moduleId),
          ),
        );
      return this.list(tx, orgId, courseId);
    });
  }
}
