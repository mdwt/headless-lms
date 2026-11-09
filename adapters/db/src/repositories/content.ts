// content — Drizzle repository for the course aggregate root (implements the core
// outbound `ContentRepository` port). Org-scoped: every method takes the domain
// `organizations.id` and constrains its queries to that tenant. Rows come back
// as stored — derived counts and cross-entity composition live in reporting.
import {
  eq,
  and,
  sql,
  count,
  asc,
  desc,
  ilike,
  or,
  inArray,
  gt,
  lt,
  type SQL,
  type AnyColumn,
} from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { DbExecutor, Tx } from "../client.js";
import type {
  Activity,
  ActivityAsset,
  AddDownloadAssetInput,
  Bundle,
  BundleItem,
  Community,
  CommunityDigest,
  CommunityStatus,
  ContentRepository,
  Course,
  CourseSettings,
  CourseStatus,
  CreateBundleInput,
  CreateCommunityInput,
  CreateCourseInput,
  CreateDownloadInput,
  CreateSpaceInput,
  DigestSchedule,
  Download,
  DownloadAsset,
  DownloadStatus,
  Event,
  EventAsset,
  EventPatch,
  EventSettings,
  EventStatus,
  AddEventAssetInput,
  CreateEventInput,
  ListEventsQuery,
  ListBundlesQuery,
  ListCommunitiesQuery,
  ListCoursesQuery,
  ListDownloadsQuery,
  Module,
  Page,
  PatchCommunitySettingsInput,
  SaveActivityInput,
  SetSpaceTopicsInput,
  Space,
  SpaceAccessRule,
  SpaceDetail,
  UpdateBundleInput,
  UpdateCommunityInput,
  UpdateCourseInput,
  UpdateDownloadInput,
  UpdateSpaceInput,
} from "@headless-lms/core/content";
import {
  communitySettingsDefaults,
  courseSettingsDefaults,
  digestScheduleSchema,
  eventSettingsDefaults,
  spaceSettingsDefaults,
  type Setting,
} from "@headless-lms/core/schemas";
import {
  bundles,
  bundleItems,
  communities,
  contentItems,
  courses,
  modules,
  activities,
  activityAssets,
  downloads,
  downloadAssets,
  eventAssets,
  events,
  spaceLinks,
  spaceTopics,
  spaces,
} from "../schema/content.js";
import { settings } from "../schema/settings.js";
import { posts } from "../schema/discussion.js";
import { deepMerge } from "./settings.js";
import { genId } from "@headless-lms/core/shared/id";
import type { Logger } from "@headless-lms/core/shared/ports";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { NotFoundError, ConflictError } from "@headless-lms/core/shared/errors";
import { isUniqueViolation, pgErrorFields, translateDbErrors } from "./pg-errors.js";

const LIBRARY_ONLY = "An activity can only use ready files from the media library";
const MISSING_ASSET_DETAIL = /^Key \(org_id, asset_id\)=\((?:[^,]+), (.+?)\) is not present/;

function refusedLink(err: unknown): ConflictError | undefined {
  const pg = pgErrorFields(err);
  if (pg?.code !== "23503") {
    return undefined;
  }
  const missing = pg.detail?.match(MISSING_ASSET_DETAIL)?.[1];
  const message = missing ? `${LIBRARY_ONLY}. Not available: ${missing}` : LIBRARY_ONLY;
  return Object.assign(new ConflictError(message), { cause: err });
}

// A course's settings live in the shared `settings` table (namespace
// 'content', scoped by course id) — joined here so the repository answers in
// whole courses regardless of where the pieces are stored.
export const SETTINGS_NAMESPACE = "content";

const courseSettingsJoin = and(
  eq(settings.orgId, courses.orgId),
  eq(settings.namespace, SETTINGS_NAMESPACE),
  eq(settings.scopeId, courses.id),
);

const communitySettingsJoin = and(
  eq(settings.orgId, communities.orgId),
  eq(settings.namespace, SETTINGS_NAMESPACE),
  eq(settings.scopeId, communities.id),
);

const eventSettingsJoin = and(
  eq(settings.orgId, events.orgId),
  eq(settings.namespace, SETTINGS_NAMESPACE),
  eq(settings.scopeId, events.id),
);

function toEvent(
  row: typeof events.$inferSelect,
  storedSettings: Record<string, unknown> | null,
): Event {
  return {
    ...row,
    status: row.status as EventStatus,
    settings: { ...eventSettingsDefaults, ...storedSettings } as EventSettings,
  };
}

const eventSortColumns: Record<string, AnyColumn | SQL> = {
  startsAt: events.startsAt,
  title: events.title,
};

function storedDigest(value: unknown): DigestSchedule | null {
  const parsed = digestScheduleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toCommunity(
  row: typeof communities.$inferSelect,
  storedSettings: Record<string, unknown> | null,
): Community {
  const raw = storedSettings?.dm;
  const stored =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    ...row,
    status: row.status as CommunityStatus,
    settings: {
      dm: { ...communitySettingsDefaults.dm, ...stored } as Community["settings"]["dm"],
      digest: storedDigest(storedSettings?.digest),
    },
  };
}

function toSpace(row: typeof spaces.$inferSelect): Space {
  return {
    ...row,
    accessRule: row.accessRule as SpaceAccessRule,
    settings: { ...spaceSettingsDefaults, ...row.settings },
  };
}

const communitySortColumns: Record<string, AnyColumn | SQL> = {
  title: communities.title,
  slug: communities.slug,
  status: communities.status,
  createdAt: communities.createdAt,
  updatedAt: communities.updatedAt,
};

function toCourse(
  row: typeof courses.$inferSelect,
  storedSettings: Record<string, unknown> | null,
): Course {
  return {
    ...row,
    status: row.status as CourseStatus,
    settings: { ...courseSettingsDefaults, ...storedSettings } as Course["settings"],
  };
}

// Columns a caller may sort by. Default falls back to createdAt desc.
const sortColumns: Record<string, AnyColumn | SQL> = {
  title: courses.title,
  slug: courses.slug,
  status: courses.status,
  category: courses.category,
  createdAt: courses.createdAt,
  updatedAt: courses.updatedAt,
};

const downloadSortColumns: Record<string, AnyColumn | SQL> = {
  title: downloads.title,
  slug: downloads.slug,
  status: downloads.status,
  category: downloads.category,
  createdAt: downloads.createdAt,
  updatedAt: downloads.updatedAt,
};

function toDownload(row: typeof downloads.$inferSelect): Download {
  return { ...row, status: row.status as DownloadStatus };
}

const bundleSortColumns: Record<string, AnyColumn | SQL> = {
  name: bundles.name,
  createdAt: bundles.createdAt,
  updatedAt: bundles.updatedAt,
};

export class DrizzleContentRepository implements ContentRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly logger: Logger = noopLogger,
  ) {}

  /** On the root db this opens a transaction; tx-bound (ContentUnitOfWork) it
   *  nests as a savepoint inside the surrounding transaction. */
  private tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return (this.db as NodePgDatabase).transaction(fn);
  }

  async listCourses(orgId: string, query: ListCoursesQuery, ids?: string[]): Promise<Page<Course>> {
    if (ids?.length === 0) {
      return { rows: [], total: 0, page: query.page, pageSize: query.pageSize };
    }
    const conditions: SQL[] = [eq(courses.orgId, orgId)];
    if (ids) {
      conditions.push(inArray(courses.id, ids));
    }
    if (query.status) {
      conditions.push(eq(courses.status, query.status));
    }
    if (query.category) {
      conditions.push(eq(courses.category, query.category));
    }

    const search = query.search?.trim();
    if (search) {
      const like = `%${search}%`;
      const match = or(ilike(courses.title, like), ilike(courses.category, like));
      if (match) {
        conditions.push(match);
      }
    }

    const where = and(...conditions);

    // Resolve sort: `-` prefix = desc, default createdAt desc.
    let sortKey = "createdAt";
    let direction: "asc" | "desc" = "desc";
    if (query.sort) {
      const isDesc = query.sort.startsWith("-");
      const key = isDesc ? query.sort.slice(1) : query.sort;
      if (key in sortColumns) {
        sortKey = key;
        direction = isDesc ? "desc" : "asc";
      }
    }
    const sortExpr = sortColumns[sortKey] ?? courses.createdAt;
    const orderBy = direction === "desc" ? desc(sortExpr) : asc(sortExpr);

    const rows = await this.db
      .select({ course: courses, settingsValue: settings.value })
      .from(courses)
      .leftJoin(settings, courseSettingsJoin)
      .where(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const [totalRow] = await this.db.select({ value: count() }).from(courses).where(where);

    return {
      rows: rows.map((row) => toCourse(row.course, row.settingsValue)),
      total: totalRow?.value ?? 0,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findCourseById(orgId: string, id: string): Promise<Course | null> {
    const [row] = await this.db
      .select({ course: courses, settingsValue: settings.value })
      .from(courses)
      .leftJoin(settings, courseSettingsJoin)
      .where(and(eq(courses.orgId, orgId), eq(courses.id, id)))
      .limit(1);
    return row ? toCourse(row.course, row.settingsValue) : null;
  }

  async createCourse(orgId: string, input: CreateCourseInput, slug: string): Promise<Course> {
    // Registry row + concrete row share one id. Both inserts run on the same
    // executor — mutations reach this repository tx-bound (ContentUnitOfWork),
    // so they commit or roll back together.
    const id = genId("course");
    await this.db.insert(contentItems).values({ orgId, id, type: "course" });
    const [inserted] = await this.db
      .insert(courses)
      .values({
        orgId,
        id,
        title: input.title,
        slug,
        description: input.description ?? "",
        category: input.category ?? "",
      })
      .returning({ id: courses.id });
    if (!inserted) {
      throw new Error("failed to insert course");
    }
    const created = await this.findCourseById(orgId, inserted.id);
    if (!created) {
      throw new Error("failed to load created course");
    }
    return created;
  }

  async updateCourse(orgId: string, id: string, patch: UpdateCourseInput): Promise<Course | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.title !== undefined) {
      set.title = patch.title;
    }
    if (patch.description !== undefined) {
      set.description = patch.description;
    }
    if (patch.category !== undefined) {
      set.category = patch.category;
    }
    if (patch.status !== undefined) {
      set.status = patch.status;
    }
    // null is meaningful here — it clears the cover — so only `undefined` skips.
    if (patch.thumbnailAssetId !== undefined) {
      set.thumbnailAssetId = patch.thumbnailAssetId;
    }

    const [updated] = await this.db
      .update(courses)
      .set(set)
      .where(and(eq(courses.orgId, orgId), eq(courses.id, id)))
      .returning({ id: courses.id });
    if (!updated) {
      return null;
    }
    return this.findCourseById(orgId, id);
  }

  async patchCourseSettings(
    orgId: string,
    id: string,
    value: Partial<CourseSettings>,
  ): Promise<CourseSettings> {
    const merged = await this.patchSettings(orgId, id, value);
    return { ...courseSettingsDefaults, ...merged } as CourseSettings;
  }

  async deleteCourse(orgId: string, id: string): Promise<boolean> {
    // Deletes go through the registry: cascades to the course row and its
    // entitlements in one statement. Never delete from `courses` directly —
    // that would strand the registry row.
    const deleted = await this.db
      .delete(contentItems)
      .where(
        and(
          eq(contentItems.orgId, orgId),
          eq(contentItems.id, id),
          eq(contentItems.type, "course"),
        ),
      )
      .returning({ id: contentItems.id });
    return deleted.length > 0;
  }

  // --- modules & activities ----------------------------------------------
  // Every mutation returns the course's full ordered module list (by `seq`),
  // so `listModules` runs at the end of every mutation within the same
  // transaction. An Activity's media is the many-to-many `activity_assets`
  // join: `saveActivity` upserts the row and replaces its asset links; deletes
  // drop the links first (they FK the activity), then the activity rows.

  listCourseModules(orgId: string, courseId: string): Promise<Module[]> {
    return this.tx((tx) => this.listModules(tx, orgId, courseId));
  }

  async listActivitiesForCourse(orgId: string, courseId: string): Promise<Activity[]> {
    return this.db
      .select()
      .from(activities)
      .where(and(eq(activities.orgId, orgId), eq(activities.courseId, courseId)))
      .orderBy(activities.moduleId, activities.seq);
  }

  // Bare join-table rows; the activities join only scopes them to the course.
  async listActivityAssetsForCourse(orgId: string, courseId: string): Promise<ActivityAsset[]> {
    return this.db
      .select({
        orgId: activityAssets.orgId,
        id: activityAssets.id,
        activityId: activityAssets.activityId,
        assetId: activityAssets.assetId,
        seq: activityAssets.seq,
        createdAt: activityAssets.createdAt,
        updatedAt: activityAssets.updatedAt,
      })
      .from(activityAssets)
      .innerJoin(
        activities,
        and(
          eq(activities.orgId, activityAssets.orgId),
          eq(activities.id, activityAssets.activityId),
        ),
      )
      .where(and(eq(activityAssets.orgId, orgId), eq(activities.courseId, courseId)))
      .orderBy(activityAssets.activityId, activityAssets.seq);
  }

  async findActivity(orgId: string, activityId: string): Promise<Activity | null> {
    const [row] = await this.db
      .select()
      .from(activities)
      .where(and(eq(activities.orgId, orgId), eq(activities.id, activityId)))
      .limit(1);
    return row ?? null;
  }

  async findModule(orgId: string, moduleId: string): Promise<Module | null> {
    const [row] = await this.db
      .select()
      .from(modules)
      .where(and(eq(modules.orgId, orgId), eq(modules.id, moduleId)))
      .limit(1);
    return row ?? null;
  }

  /** The course's full ordered module list. */
  private async listModules(tx: Tx, orgId: string, courseId: string): Promise<Module[]> {
    return tx
      .select()
      .from(modules)
      .where(and(eq(modules.orgId, orgId), eq(modules.courseId, courseId)))
      .orderBy(modules.seq);
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
      throw new NotFoundError("Module", moduleId);
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
      try {
        await tx
          .insert(activityAssets)
          .values(assetIds.map((assetId, i) => ({ orgId, activityId, assetId, seq: i })));
      } catch (err) {
        throw refusedLink(err) ?? err;
      }
    }
  }

  createModule(orgId: string, courseId: string, title: string): Promise<Module[]> {
    return this.tx(async (tx) => {
      const existing = await tx
        .select({ seq: modules.seq })
        .from(modules)
        .where(and(eq(modules.orgId, orgId), eq(modules.courseId, courseId)));
      const nextSeq = existing.reduce((max, r) => Math.max(max, r.seq), -1) + 1;
      await tx.insert(modules).values({ orgId, courseId, title, seq: nextSeq });
      return this.listModules(tx, orgId, courseId);
    });
  }

  updateModule(
    orgId: string,
    courseId: string,
    moduleId: string,
    title: string,
  ): Promise<Module[]> {
    return this.tx(async (tx) => {
      await this.assertModule(tx, orgId, courseId, moduleId);
      await tx
        .update(modules)
        .set({ title })
        .where(
          and(eq(modules.orgId, orgId), eq(modules.id, moduleId), eq(modules.courseId, courseId)),
        );
      return this.listModules(tx, orgId, courseId);
    });
  }

  deleteModule(orgId: string, courseId: string, moduleId: string): Promise<Module[]> {
    return this.tx(async (tx) => {
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
      return this.listModules(tx, orgId, courseId);
    });
  }

  reorderModules(orgId: string, courseId: string, orderedIds: string[]): Promise<Module[]> {
    return this.tx(async (tx) => {
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
      return this.listModules(tx, orgId, courseId);
    });
  }

  reorderActivities(
    orgId: string,
    courseId: string,
    moduleId: string,
    orderedIds: string[],
  ): Promise<Module[]> {
    return this.tx(async (tx) => {
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
      return this.listModules(tx, orgId, courseId);
    });
  }

  saveActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    input: SaveActivityInput,
    activityId?: string,
  ): Promise<{ modules: Module[]; activity: Activity }> {
    return this.tx(async (tx) => {
      await this.assertModule(tx, orgId, courseId, moduleId);

      let savedId: string;
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
          throw new NotFoundError("Activity", activityId);
        }

        await tx
          .update(activities)
          .set({ settings: input.settings ?? null })
          .where(and(eq(activities.orgId, orgId), eq(activities.id, activityId)));
        if (input.assetIds !== undefined) {
          await this.replaceActivityAssets(tx, orgId, activityId, input.assetIds);
        }
        savedId = activityId;
      } else {
        const existing = await tx
          .select({ seq: activities.seq })
          .from(activities)
          .where(and(eq(activities.orgId, orgId), eq(activities.moduleId, moduleId)));
        const nextSeq = existing.reduce((max, r) => Math.max(max, r.seq), -1) + 1;

        const [ins] = await tx
          .insert(activities)
          .values({ orgId, moduleId, courseId, seq: nextSeq, settings: input.settings ?? null })
          .returning({ id: activities.id });
        if (!ins) {
          throw new Error("failed to insert activity");
        }
        await this.replaceActivityAssets(tx, orgId, ins.id, input.assetIds ?? []);
        savedId = ins.id;
      }

      const [activity] = await tx
        .select()
        .from(activities)
        .where(and(eq(activities.orgId, orgId), eq(activities.id, savedId)))
        .limit(1);
      if (!activity) {
        throw new Error("failed to load saved activity");
      }
      return { modules: await this.listModules(tx, orgId, courseId), activity };
    });
  }

  deleteActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    activityId: string,
  ): Promise<Module[]> {
    return this.tx(async (tx) => {
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

      return this.listModules(tx, orgId, courseId);
    });
  }

  // --- downloads --------------------------------------------------------

  async listDownloads(
    orgId: string,
    query: ListDownloadsQuery,
    ids?: string[],
  ): Promise<Page<Download>> {
    if (ids?.length === 0) {
      return { rows: [], total: 0, page: query.page, pageSize: query.pageSize };
    }
    const conditions: SQL[] = [eq(downloads.orgId, orgId)];
    if (ids) {
      conditions.push(inArray(downloads.id, ids));
    }
    if (query.status) {
      conditions.push(eq(downloads.status, query.status));
    }
    if (query.category) {
      conditions.push(eq(downloads.category, query.category));
    }

    const search = query.search?.trim();
    if (search) {
      const like = `%${search}%`;
      const match = or(ilike(downloads.title, like), ilike(downloads.category, like));
      if (match) {
        conditions.push(match);
      }
    }

    const where = and(...conditions);

    // Resolve sort: `-` prefix = desc, default createdAt desc.
    let sortKey = "createdAt";
    let direction: "asc" | "desc" = "desc";
    if (query.sort) {
      const isDesc = query.sort.startsWith("-");
      const key = isDesc ? query.sort.slice(1) : query.sort;
      if (key in downloadSortColumns) {
        sortKey = key;
        direction = isDesc ? "desc" : "asc";
      }
    }
    const sortExpr = downloadSortColumns[sortKey] ?? downloads.createdAt;
    const orderBy = direction === "desc" ? desc(sortExpr) : asc(sortExpr);

    const rows = await this.db
      .select()
      .from(downloads)
      .where(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const [totalRow] = await this.db.select({ value: count() }).from(downloads).where(where);

    return {
      rows: rows.map(toDownload),
      total: totalRow?.value ?? 0,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getDownload(orgId: string, id: string): Promise<Download | null> {
    const [row] = await this.db
      .select()
      .from(downloads)
      .where(and(eq(downloads.orgId, orgId), eq(downloads.id, id)))
      .limit(1);
    return row ? toDownload(row) : null;
  }

  async createDownload(orgId: string, input: CreateDownloadInput, slug: string): Promise<Download> {
    // Registry row + concrete row share one id, same as courses. Both inserts
    // run on the same executor — mutations reach this repository tx-bound.
    const id = genId("download");
    await this.db.insert(contentItems).values({ orgId, id, type: "download" });
    await this.db.insert(downloads).values({
      orgId,
      id,
      title: input.title,
      slug,
      description: input.description ?? "",
      category: input.category ?? "",
    });
    const created = await this.getDownload(orgId, id);
    if (!created) {
      throw new Error("failed to load created download");
    }
    return created;
  }

  async updateDownload(
    orgId: string,
    id: string,
    patch: UpdateDownloadInput,
  ): Promise<Download | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.title !== undefined) {
      set.title = patch.title;
    }
    if (patch.description !== undefined) {
      set.description = patch.description;
    }
    if (patch.category !== undefined) {
      set.category = patch.category;
    }
    if (patch.status !== undefined) {
      set.status = patch.status;
    }
    if (patch.thumbnailAssetId !== undefined) {
      set.thumbnailAssetId = patch.thumbnailAssetId;
    }

    const [updated] = await this.db
      .update(downloads)
      .set(set)
      .where(and(eq(downloads.orgId, orgId), eq(downloads.id, id)))
      .returning({ id: downloads.id });
    if (!updated) {
      return null;
    }
    return this.getDownload(orgId, id);
  }

  async deleteDownload(orgId: string, id: string): Promise<boolean> {
    // Through the registry, so the cascade reaches the download row, its asset
    // links, and the grants. Never delete from `downloads` directly.
    const deleted = await this.db
      .delete(contentItems)
      .where(
        and(
          eq(contentItems.orgId, orgId),
          eq(contentItems.id, id),
          eq(contentItems.type, "download"),
        ),
      )
      .returning({ id: contentItems.id });
    return deleted.length > 0;
  }

  async listDownloadAssets(orgId: string, downloadId: string): Promise<DownloadAsset[]> {
    return this.db
      .select()
      .from(downloadAssets)
      .where(and(eq(downloadAssets.orgId, orgId), eq(downloadAssets.downloadId, downloadId)))
      .orderBy(asc(downloadAssets.seq));
  }

  /** Assert the download exists in the org; throw otherwise. */
  private async assertDownload(orgId: string, downloadId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: downloads.id })
      .from(downloads)
      .where(and(eq(downloads.orgId, orgId), eq(downloads.id, downloadId)))
      .limit(1);
    if (!row) {
      throw new NotFoundError("Download", downloadId);
    }
  }

  async addDownloadAsset(
    orgId: string,
    downloadId: string,
    input: AddDownloadAssetInput,
  ): Promise<DownloadAsset[]> {
    await this.assertDownload(orgId, downloadId);
    const [maxRow] = await this.db
      .select({ maxSeq: sql<number | null>`max(${downloadAssets.seq})` })
      .from(downloadAssets)
      .where(and(eq(downloadAssets.orgId, orgId), eq(downloadAssets.downloadId, downloadId)));
    const nextSeq = (maxRow?.maxSeq ?? -1) + 1;
    try {
      await this.db.insert(downloadAssets).values({
        orgId,
        downloadId,
        assetId: input.assetId,
        seq: nextSeq,
        displayName: input.displayName ?? null,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError("This asset is already linked to the download");
      }
      throw err;
    }
    return this.listDownloadAssets(orgId, downloadId);
  }

  async removeDownloadAsset(
    orgId: string,
    downloadId: string,
    assetId: string,
  ): Promise<DownloadAsset[]> {
    await this.assertDownload(orgId, downloadId);
    await this.db
      .delete(downloadAssets)
      .where(
        and(
          eq(downloadAssets.orgId, orgId),
          eq(downloadAssets.downloadId, downloadId),
          eq(downloadAssets.assetId, assetId),
        ),
      );
    return this.listDownloadAssets(orgId, downloadId);
  }

  async renameDownloadAsset(
    orgId: string,
    downloadId: string,
    assetId: string,
    displayName: string | null,
  ): Promise<DownloadAsset[]> {
    await this.assertDownload(orgId, downloadId);
    await this.db
      .update(downloadAssets)
      .set({ displayName })
      .where(
        and(
          eq(downloadAssets.orgId, orgId),
          eq(downloadAssets.downloadId, downloadId),
          eq(downloadAssets.assetId, assetId),
        ),
      );
    return this.listDownloadAssets(orgId, downloadId);
  }

  async reorderDownloadAssets(
    orgId: string,
    downloadId: string,
    assetIds: string[],
  ): Promise<DownloadAsset[]> {
    await this.assertDownload(orgId, downloadId);
    // The service has already verified this is exactly the current set.
    for (const [seq, assetId] of assetIds.entries()) {
      await this.db
        .update(downloadAssets)
        .set({ seq })
        .where(
          and(
            eq(downloadAssets.orgId, orgId),
            eq(downloadAssets.downloadId, downloadId),
            eq(downloadAssets.assetId, assetId),
          ),
        );
    }
    return this.listDownloadAssets(orgId, downloadId);
  }

  async listEvents(orgId: string, query: ListEventsQuery, ids?: string[]): Promise<Page<Event>> {
    if (ids?.length === 0) {
      return { rows: [], total: 0, page: query.page, pageSize: query.pageSize };
    }
    const conditions: SQL[] = [eq(events.orgId, orgId)];
    if (ids) {
      conditions.push(inArray(events.id, ids));
    }
    if (query.status) {
      conditions.push(eq(events.status, query.status));
    }
    if (query.from) {
      conditions.push(gt(events.endsAt, query.from));
    }
    if (query.to) {
      conditions.push(lt(events.startsAt, query.to));
    }
    const search = query.search?.trim();
    if (search) {
      conditions.push(ilike(events.title, `%${search}%`));
    }
    const where = and(...conditions);

    const sort = query.sort ?? "startsAt";
    const isDesc = sort.startsWith("-");
    const sortExpr = eventSortColumns[isDesc ? sort.slice(1) : sort] ?? events.startsAt;
    const direction = isDesc ? desc : asc;

    const rows = await this.db
      .select({ event: events, settingsValue: settings.value })
      .from(events)
      .leftJoin(settings, eventSettingsJoin)
      .where(where)
      .orderBy(direction(sortExpr), direction(events.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const [totalRow] = await this.db.select({ value: count() }).from(events).where(where);

    return {
      rows: rows.map((row) => toEvent(row.event, row.settingsValue)),
      total: totalRow?.value ?? 0,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findEventById(orgId: string, id: string): Promise<Event | null> {
    const [row] = await this.db
      .select({ event: events, settingsValue: settings.value })
      .from(events)
      .leftJoin(settings, eventSettingsJoin)
      .where(and(eq(events.orgId, orgId), eq(events.id, id)))
      .limit(1);
    return row ? toEvent(row.event, row.settingsValue) : null;
  }

  async findEventsByIds(orgId: string, ids: string[]): Promise<Event[]> {
    const rows = await this.db
      .select({ event: events, settingsValue: settings.value })
      .from(events)
      .leftJoin(settings, eventSettingsJoin)
      .where(and(eq(events.orgId, orgId), inArray(events.id, ids)));
    return rows.map((row) => toEvent(row.event, row.settingsValue));
  }

  async createEvent(orgId: string, input: Omit<CreateEventInput, "settings">): Promise<Event> {
    const id = genId("contentEvent");
    await this.db.insert(contentItems).values({ orgId, id, type: "event" });
    await this.db.insert(events).values({
      orgId,
      id,
      title: input.title,
      description: input.description ?? "",
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timeZone: input.timeZone,
      ...(input.location && { location: input.location }),
    });
    const created = await this.findEventById(orgId, id);
    if (!created) {
      throw new Error("failed to load created event");
    }
    return created;
  }

  async updateEvent(orgId: string, id: string, patch: EventPatch): Promise<Event | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of [
      "title",
      "description",
      "startsAt",
      "endsAt",
      "timeZone",
      "location",
      "thumbnailAssetId",
      "recording",
      "status",
    ] as const) {
      if (patch[key] !== undefined) {
        set[key] = patch[key];
      }
    }
    const [updated] = await this.db
      .update(events)
      .set(set)
      .where(and(eq(events.orgId, orgId), eq(events.id, id)))
      .returning({ id: events.id });
    if (!updated) {
      return null;
    }
    return this.findEventById(orgId, id);
  }

  async patchEventSettings(
    orgId: string,
    id: string,
    value: Partial<EventSettings>,
  ): Promise<EventSettings> {
    const merged = await this.patchSettings(orgId, id, value);
    return { ...eventSettingsDefaults, ...merged } as EventSettings;
  }

  async deleteEvent(orgId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(contentItems)
      .where(
        and(eq(contentItems.orgId, orgId), eq(contentItems.id, id), eq(contentItems.type, "event")),
      )
      .returning({ id: contentItems.id });
    return deleted.length > 0;
  }

  async deleteEventSettings(orgId: string, id: string): Promise<void> {
    await this.db
      .delete(settings)
      .where(
        and(
          eq(settings.orgId, orgId),
          eq(settings.namespace, SETTINGS_NAMESPACE),
          eq(settings.scopeId, id),
        ),
      );
  }

  async listEventAssets(orgId: string, eventId: string): Promise<EventAsset[]> {
    return this.db
      .select()
      .from(eventAssets)
      .where(and(eq(eventAssets.orgId, orgId), eq(eventAssets.eventId, eventId)))
      .orderBy(asc(eventAssets.seq));
  }

  async listEventAssetsFor(orgId: string, eventIds: string[]): Promise<EventAsset[]> {
    return this.db
      .select()
      .from(eventAssets)
      .where(and(eq(eventAssets.orgId, orgId), inArray(eventAssets.eventId, eventIds)))
      .orderBy(asc(eventAssets.eventId), asc(eventAssets.seq));
  }

  private async assertEvent(orgId: string, eventId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.orgId, orgId), eq(events.id, eventId)))
      .limit(1);
    if (!row) {
      throw new NotFoundError("Event", eventId);
    }
  }

  async addEventAsset(
    orgId: string,
    eventId: string,
    input: AddEventAssetInput,
  ): Promise<EventAsset[]> {
    await this.assertEvent(orgId, eventId);
    const [maxRow] = await this.db
      .select({ maxSeq: sql<number | null>`max(${eventAssets.seq})` })
      .from(eventAssets)
      .where(and(eq(eventAssets.orgId, orgId), eq(eventAssets.eventId, eventId)));
    const nextSeq = (maxRow?.maxSeq ?? -1) + 1;
    try {
      await this.db.insert(eventAssets).values({
        orgId,
        eventId,
        assetId: input.assetId,
        seq: nextSeq,
        displayName: input.displayName ?? null,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError("This asset is already linked to the event");
      }
      throw err;
    }
    return this.listEventAssets(orgId, eventId);
  }

  async removeEventAsset(orgId: string, eventId: string, assetId: string): Promise<EventAsset[]> {
    await this.assertEvent(orgId, eventId);
    await this.db
      .delete(eventAssets)
      .where(
        and(
          eq(eventAssets.orgId, orgId),
          eq(eventAssets.eventId, eventId),
          eq(eventAssets.assetId, assetId),
        ),
      );
    return this.listEventAssets(orgId, eventId);
  }

  async renameEventAsset(
    orgId: string,
    eventId: string,
    assetId: string,
    displayName: string | null,
  ): Promise<EventAsset[]> {
    await this.assertEvent(orgId, eventId);
    await this.db
      .update(eventAssets)
      .set({ displayName })
      .where(
        and(
          eq(eventAssets.orgId, orgId),
          eq(eventAssets.eventId, eventId),
          eq(eventAssets.assetId, assetId),
        ),
      );
    return this.listEventAssets(orgId, eventId);
  }

  async reorderEventAssets(
    orgId: string,
    eventId: string,
    assetIds: string[],
  ): Promise<EventAsset[]> {
    await this.assertEvent(orgId, eventId);
    for (const [seq, assetId] of assetIds.entries()) {
      await this.db
        .update(eventAssets)
        .set({ seq })
        .where(
          and(
            eq(eventAssets.orgId, orgId),
            eq(eventAssets.eventId, eventId),
            eq(eventAssets.assetId, assetId),
          ),
        );
    }
    return this.listEventAssets(orgId, eventId);
  }

  // --- bundles ----------------------------------------------------------

  async listBundles(orgId: string, query: ListBundlesQuery): Promise<Page<Bundle>> {
    const conditions: SQL[] = [eq(bundles.orgId, orgId)];

    const search = query.search?.trim();
    if (search) {
      conditions.push(ilike(bundles.name, `%${search}%`));
    }

    const where = and(...conditions);

    // Resolve sort: `-` prefix = desc, default createdAt desc.
    let sortKey = "createdAt";
    let direction: "asc" | "desc" = "desc";
    if (query.sort) {
      const isDesc = query.sort.startsWith("-");
      const key = isDesc ? query.sort.slice(1) : query.sort;
      if (key in bundleSortColumns) {
        sortKey = key;
        direction = isDesc ? "desc" : "asc";
      }
    }
    const sortExpr = bundleSortColumns[sortKey] ?? bundles.createdAt;
    const orderBy = direction === "desc" ? desc(sortExpr) : asc(sortExpr);

    const rows = await this.db
      .select()
      .from(bundles)
      .where(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const [totalRow] = await this.db.select({ value: count() }).from(bundles).where(where);

    return {
      rows,
      total: totalRow?.value ?? 0,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findBundleById(orgId: string, id: string): Promise<Bundle | null> {
    const [row] = await this.db
      .select()
      .from(bundles)
      .where(and(eq(bundles.orgId, orgId), eq(bundles.id, id)))
      .limit(1);
    return row ?? null;
  }

  /** The bundle and its initial items are one write: an unknown content id
   *  rolls the bundle back rather than leaving it created and half-filled. */
  async createBundle(orgId: string, input: CreateBundleInput): Promise<Bundle> {
    const contentIds = [...new Set(input.contentIds ?? [])];
    return this.tx(async (tx) => {
      // A bundle is not content: it groups registry rows, so it gets no
      // content_items row of its own.
      const [row] = await tx
        .insert(bundles)
        .values({ orgId, id: genId("bundle"), name: input.name })
        .returning();
      if (!row) {
        throw new Error("failed to load created bundle");
      }

      if (contentIds.length > 0) {
        // Against the registry, so any content type can be bundled.
        const found = await tx
          .select({ id: contentItems.id })
          .from(contentItems)
          .where(and(eq(contentItems.orgId, orgId), inArray(contentItems.id, contentIds)));
        const known = new Set(found.map((item) => item.id));
        const missing = contentIds.find((id) => !known.has(id));
        if (missing) {
          throw new NotFoundError("Content", missing);
        }

        await tx
          .insert(bundleItems)
          .values(contentIds.map((contentId) => ({ orgId, bundleId: row.id, contentId })));
      }

      return row;
    });
  }

  async updateBundle(orgId: string, id: string, patch: UpdateBundleInput): Promise<Bundle | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) {
      set.name = patch.name;
    }

    const [row] = await this.db
      .update(bundles)
      .set(set)
      .where(and(eq(bundles.orgId, orgId), eq(bundles.id, id)))
      .returning();
    return row ?? null;
  }

  async deleteBundle(orgId: string, id: string): Promise<boolean> {
    // Cascades to the bundle's items and to the grants made on it. The content
    // itself is untouched — a bundle only groups registry rows.
    const deleted = await this.db
      .delete(bundles)
      .where(and(eq(bundles.orgId, orgId), eq(bundles.id, id)))
      .returning({ id: bundles.id });
    return deleted.length > 0;
  }

  async listBundleItems(orgId: string, bundleId: string): Promise<BundleItem[]> {
    return this.db
      .select()
      .from(bundleItems)
      .where(and(eq(bundleItems.orgId, orgId), eq(bundleItems.bundleId, bundleId)))
      .orderBy(asc(bundleItems.createdAt));
  }

  /** Assert the bundle exists in the org; throw otherwise. */
  private async assertBundle(orgId: string, bundleId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: bundles.id })
      .from(bundles)
      .where(and(eq(bundles.orgId, orgId), eq(bundles.id, bundleId)))
      .limit(1);
    if (!row) {
      throw new NotFoundError("Bundle", bundleId);
    }
  }

  async addBundleItem(orgId: string, bundleId: string, contentId: string): Promise<BundleItem[]> {
    await this.assertBundle(orgId, bundleId);
    // Against the registry, so any content type can be bundled.
    const [item] = await this.db
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(and(eq(contentItems.orgId, orgId), eq(contentItems.id, contentId)))
      .limit(1);
    if (!item) {
      throw new NotFoundError("Content", contentId);
    }
    await this.db
      .insert(bundleItems)
      .values({ orgId, bundleId, contentId })
      .onConflictDoNothing({
        target: [bundleItems.orgId, bundleItems.bundleId, bundleItems.contentId],
      });
    return this.listBundleItems(orgId, bundleId);
  }

  async removeBundleItem(
    orgId: string,
    bundleId: string,
    contentId: string,
  ): Promise<BundleItem[]> {
    await this.assertBundle(orgId, bundleId);
    await this.db
      .delete(bundleItems)
      .where(
        and(
          eq(bundleItems.orgId, orgId),
          eq(bundleItems.bundleId, bundleId),
          eq(bundleItems.contentId, contentId),
        ),
      );
    return this.listBundleItems(orgId, bundleId);
  }

  async listCommunities(
    orgId: string,
    query: ListCommunitiesQuery,
    ids?: string[],
  ): Promise<Page<Community>> {
    if (ids?.length === 0) {
      return { rows: [], total: 0, page: query.page, pageSize: query.pageSize };
    }
    const conditions: SQL[] = [eq(communities.orgId, orgId)];
    if (ids) {
      conditions.push(inArray(communities.id, ids));
    }
    if (query.status) {
      conditions.push(eq(communities.status, query.status));
    }
    const search = query.search?.trim();
    if (search) {
      const like = `%${search}%`;
      const match = or(ilike(communities.title, like), ilike(communities.description, like));
      if (match) {
        conditions.push(match);
      }
    }
    const where = and(...conditions);
    let sortKey = "createdAt";
    let direction: "asc" | "desc" = "desc";
    if (query.sort) {
      const isDesc = query.sort.startsWith("-");
      const key = isDesc ? query.sort.slice(1) : query.sort;
      if (key in communitySortColumns) {
        sortKey = key;
        direction = isDesc ? "desc" : "asc";
      }
    }
    const sortExpr = communitySortColumns[sortKey] ?? communities.createdAt;
    const orderBy = direction === "desc" ? desc(sortExpr) : asc(sortExpr);
    const rows = await this.db
      .select({ community: communities, settingsValue: settings.value })
      .from(communities)
      .leftJoin(settings, communitySettingsJoin)
      .where(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const [totalRow] = await this.db.select({ value: count() }).from(communities).where(where);
    return {
      rows: rows.map((row) => toCommunity(row.community, row.settingsValue)),
      total: totalRow?.value ?? 0,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findCommunityById(orgId: string, id: string): Promise<Community | null> {
    const [row] = await this.db
      .select({ community: communities, settingsValue: settings.value })
      .from(communities)
      .leftJoin(settings, communitySettingsJoin)
      .where(and(eq(communities.orgId, orgId), eq(communities.id, id)))
      .limit(1);
    return row ? toCommunity(row.community, row.settingsValue) : null;
  }

  async findCommunitiesByIds(orgId: string, ids: string[]): Promise<Community[]> {
    const rows = await this.db
      .select({ community: communities, settingsValue: settings.value })
      .from(communities)
      .leftJoin(settings, communitySettingsJoin)
      .where(and(eq(communities.orgId, orgId), inArray(communities.id, ids)))
      .orderBy(asc(communities.title), asc(communities.id));
    return rows.map((row) => toCommunity(row.community, row.settingsValue));
  }

  async createCommunity(
    orgId: string,
    input: CreateCommunityInput,
    slug: string,
  ): Promise<Community> {
    const id = genId("community");
    await this.db.insert(contentItems).values({ orgId, id, type: "community" });
    const [inserted] = await this.db
      .insert(communities)
      .values({
        orgId,
        id,
        title: input.title,
        slug,
        description: input.description ?? "",
      })
      .returning({ id: communities.id });
    if (!inserted) {
      throw new Error("failed to insert community");
    }
    const created = await this.findCommunityById(orgId, inserted.id);
    if (!created) {
      throw new Error("failed to load created community");
    }
    return created;
  }

  async updateCommunity(
    orgId: string,
    id: string,
    patch: UpdateCommunityInput,
  ): Promise<Community | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.title !== undefined) {
      set.title = patch.title;
    }
    if (patch.description !== undefined) {
      set.description = patch.description;
    }
    if (patch.status !== undefined) {
      set.status = patch.status;
    }
    if (patch.thumbnailAssetId !== undefined) {
      set.thumbnailAssetId = patch.thumbnailAssetId;
    }
    const [updated] = await this.db
      .update(communities)
      .set(set)
      .where(and(eq(communities.orgId, orgId), eq(communities.id, id)))
      .returning({ id: communities.id });
    if (!updated) {
      return null;
    }
    return this.findCommunityById(orgId, id);
  }

  async communitiesWithDigest(): Promise<CommunityDigest[]> {
    const rows = await this.db
      .select({
        orgId: communities.orgId,
        communityId: communities.id,
        digest: sql<unknown>`${settings.value} -> 'digest'`,
      })
      .from(communities)
      .innerJoin(settings, communitySettingsJoin)
      .where(
        and(
          eq(communities.status, "published"),
          sql`jsonb_typeof(${settings.value} -> 'digest') = 'object'`,
        ),
      )
      .orderBy(asc(communities.orgId), asc(communities.id));
    return rows.flatMap((row) => {
      const digest = storedDigest(row.digest);
      return digest ? [{ orgId: row.orgId, communityId: row.communityId, digest }] : [];
    });
  }

  async patchCommunitySettings(
    orgId: string,
    id: string,
    input: PatchCommunitySettingsInput,
  ): Promise<Community | null> {
    const community = await this.findCommunityById(orgId, id);
    if (!community) {
      return null;
    }
    const { digest, ...dm } = input;
    await this.patchSettings(orgId, id, digest === undefined ? { dm } : { dm, digest });
    return this.findCommunityById(orgId, id);
  }

  private async patchSettings(
    orgId: string,
    scopeId: string,
    patch: object,
  ): Promise<Setting["value"]> {
    const key = and(
      eq(settings.orgId, orgId),
      eq(settings.namespace, SETTINGS_NAMESPACE),
      eq(settings.scopeId, scopeId),
    );
    const value = patch as Setting["value"];
    return this.tx(async (tx) => {
      let [existing] = await tx.select().from(settings).where(key).for("update");
      if (!existing) {
        const [inserted] = await tx
          .insert(settings)
          .values({ orgId, namespace: SETTINGS_NAMESPACE, scopeId, value })
          .onConflictDoNothing()
          .returning();
        if (inserted) {
          return inserted.value;
        }
        [existing] = await tx.select().from(settings).where(key).for("update");
        if (!existing) {
          throw new Error(`settings patch for ${scopeId}: row vanished mid-transaction`);
        }
      }
      const [updated] = await tx
        .update(settings)
        .set({ value: deepMerge(existing.value, patch) as Setting["value"], updatedAt: new Date() })
        .where(key)
        .returning();
      if (!updated) {
        throw new Error(`settings patch for ${scopeId} returned no row`);
      }
      return updated.value;
    });
  }

  async deleteCommunity(orgId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(contentItems)
      .where(
        and(
          eq(contentItems.orgId, orgId),
          eq(contentItems.id, id),
          eq(contentItems.type, "community"),
        ),
      )
      .returning({ id: contentItems.id });
    return deleted.length > 0;
  }

  async deleteCommunitySettings(orgId: string, id: string): Promise<void> {
    await this.db
      .delete(settings)
      .where(
        and(
          eq(settings.orgId, orgId),
          eq(settings.namespace, SETTINGS_NAMESPACE),
          eq(settings.scopeId, id),
        ),
      );
  }

  async listSpaces(orgId: string, communityId: string): Promise<SpaceDetail[]> {
    const rows = await this.db
      .select()
      .from(spaces)
      .where(and(eq(spaces.orgId, orgId), eq(spaces.communityId, communityId)))
      .orderBy(asc(spaces.seq));
    return this.withSpaceParts(orgId, rows.map(toSpace));
  }

  async findSpace(orgId: string, spaceId: string): Promise<SpaceDetail | null> {
    const [row] = await this.db
      .select()
      .from(spaces)
      .where(and(eq(spaces.orgId, orgId), eq(spaces.id, spaceId)))
      .limit(1);
    if (!row) {
      return null;
    }
    const [detail] = await this.withSpaceParts(orgId, [toSpace(row)]);
    return detail ?? null;
  }

  async lockSpace(orgId: string, spaceId: string): Promise<Space | null> {
    const [row] = await this.db
      .select()
      .from(spaces)
      .where(and(eq(spaces.orgId, orgId), eq(spaces.id, spaceId)))
      .for("update")
      .limit(1);
    return row ? toSpace(row) : null;
  }

  async createSpace(
    orgId: string,
    communityId: string,
    input: CreateSpaceInput,
  ): Promise<SpaceDetail> {
    const existing = await this.db
      .select({ seq: spaces.seq })
      .from(spaces)
      .where(and(eq(spaces.orgId, orgId), eq(spaces.communityId, communityId)));
    const nextSeq = existing.reduce((max, row) => Math.max(max, row.seq), -1) + 1;
    const [inserted] = await this.db
      .insert(spaces)
      .values({
        orgId,
        communityId,
        name: input.name,
        description: input.description ?? "",
        seq: nextSeq,
        accessRule: input.accessRule ?? "all_members",
        capacity: input.capacity ?? null,
        settings: { ...spaceSettingsDefaults, ...input.settings },
      })
      .returning({ id: spaces.id });
    if (!inserted) {
      throw new Error("failed to insert space");
    }
    const created = await this.findSpace(orgId, inserted.id);
    if (!created) {
      throw new Error("failed to load created space");
    }
    return created;
  }

  async updateSpace(
    orgId: string,
    communityId: string,
    spaceId: string,
    patch: UpdateSpaceInput,
  ): Promise<SpaceDetail | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) {
      set.name = patch.name;
    }
    if (patch.description !== undefined) {
      set.description = patch.description;
    }
    if (patch.accessRule !== undefined) {
      set.accessRule = patch.accessRule;
    }
    if (patch.capacity !== undefined) {
      set.capacity = patch.capacity;
    }
    if (patch.settings !== undefined) {
      set.settings = { ...spaceSettingsDefaults, ...patch.settings };
    }
    if (patch.coverAssetId !== undefined) {
      set.coverAssetId = patch.coverAssetId;
    }
    if (patch.backgroundAssetId !== undefined) {
      set.backgroundAssetId = patch.backgroundAssetId;
    }
    if (patch.iconAssetId !== undefined) {
      set.iconAssetId = patch.iconAssetId;
    }
    const [updated] = await this.db
      .update(spaces)
      .set(set)
      .where(
        and(eq(spaces.orgId, orgId), eq(spaces.id, spaceId), eq(spaces.communityId, communityId)),
      )
      .returning({ id: spaces.id });
    if (!updated) {
      return null;
    }
    return this.findSpace(orgId, spaceId);
  }

  async deleteSpace(orgId: string, communityId: string, spaceId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(spaces)
      .where(
        and(eq(spaces.orgId, orgId), eq(spaces.id, spaceId), eq(spaces.communityId, communityId)),
      )
      .returning({ id: spaces.id });
    return deleted.length > 0;
  }

  async reorderSpaces(
    orgId: string,
    communityId: string,
    orderedIds: string[],
  ): Promise<SpaceDetail[]> {
    for (let i = 0; i < orderedIds.length; i++) {
      await this.db
        .update(spaces)
        .set({ seq: i })
        .where(
          and(
            eq(spaces.orgId, orgId),
            eq(spaces.communityId, communityId),
            eq(spaces.id, orderedIds[i]!),
          ),
        );
    }
    return this.listSpaces(orgId, communityId);
  }

  async setSpaceTopics(
    orgId: string,
    spaceId: string,
    input: SetSpaceTopicsInput,
  ): Promise<SpaceDetail> {
    await this.tx(async (tx) => {
      const existing = await tx
        .select({ id: spaceTopics.id })
        .from(spaceTopics)
        .where(and(eq(spaceTopics.orgId, orgId), eq(spaceTopics.spaceId, spaceId)))
        .for("update");
      const kept = new Set(input.topics.flatMap((topic) => (topic.id ? [topic.id] : [])));
      const known = new Set(existing.map((topic) => topic.id));
      for (const id of kept) {
        if (!known.has(id)) {
          throw new NotFoundError("Topic", id);
        }
      }
      const removed = existing.filter((topic) => !kept.has(topic.id)).map((topic) => topic.id);
      if (removed.length) {
        await tx
          .delete(spaceTopics)
          .where(and(eq(spaceTopics.orgId, orgId), inArray(spaceTopics.id, removed)));
      }
      for (let seq = 0; seq < input.topics.length; seq++) {
        const topic = input.topics[seq]!;
        if (topic.id) {
          await tx
            .update(spaceTopics)
            .set({ name: topic.name, seq, updatedAt: new Date() })
            .where(and(eq(spaceTopics.orgId, orgId), eq(spaceTopics.id, topic.id)));
        } else {
          await tx.insert(spaceTopics).values({ orgId, spaceId, name: topic.name, seq });
        }
      }
    });
    const space = await this.findSpace(orgId, spaceId);
    if (!space) {
      throw new NotFoundError("Space", spaceId);
    }
    return space;
  }

  async topicsInUse(orgId: string, spaceId: string, topicIds: string[]): Promise<string[]> {
    if (topicIds.length === 0) {
      return [];
    }
    await this.db
      .select({ id: spaceTopics.id })
      .from(spaceTopics)
      .where(
        and(
          eq(spaceTopics.orgId, orgId),
          eq(spaceTopics.spaceId, spaceId),
          inArray(spaceTopics.id, topicIds),
        ),
      )
      .for("update");
    const rows = await this.db
      .selectDistinct({ topicId: posts.topicId })
      .from(posts)
      .where(
        and(eq(posts.orgId, orgId), eq(posts.spaceId, spaceId), inArray(posts.topicId, topicIds)),
      );
    return rows.flatMap((row) => (row.topicId ? [row.topicId] : []));
  }

  async addSpaceLink(orgId: string, spaceId: string, contentId: string): Promise<SpaceDetail> {
    const [item] = await this.db
      .select({ id: contentItems.id, type: contentItems.type })
      .from(contentItems)
      .where(and(eq(contentItems.orgId, orgId), eq(contentItems.id, contentId)))
      .limit(1);
    if (
      !item ||
      (item.type !== "course" && item.type !== "download" && item.type !== "community")
    ) {
      throw new NotFoundError("Content", contentId);
    }
    const existing = await this.db
      .select({ seq: spaceLinks.seq })
      .from(spaceLinks)
      .where(and(eq(spaceLinks.orgId, orgId), eq(spaceLinks.spaceId, spaceId)));
    const nextSeq = existing.reduce((max, row) => Math.max(max, row.seq), -1) + 1;
    await this.db.insert(spaceLinks).values({ orgId, spaceId, contentId, seq: nextSeq });
    const space = await this.findSpace(orgId, spaceId);
    if (!space) {
      throw new NotFoundError("Space", spaceId);
    }
    return space;
  }

  async removeSpaceLink(orgId: string, spaceId: string, linkId: string): Promise<SpaceDetail> {
    const deleted = await this.db
      .delete(spaceLinks)
      .where(
        and(
          eq(spaceLinks.orgId, orgId),
          eq(spaceLinks.spaceId, spaceId),
          eq(spaceLinks.id, linkId),
        ),
      )
      .returning({ id: spaceLinks.id });
    if (deleted.length === 0) {
      throw new NotFoundError("Link", linkId);
    }
    const space = await this.findSpace(orgId, spaceId);
    if (!space) {
      throw new NotFoundError("Space", spaceId);
    }
    return space;
  }

  async reorderSpaceLinks(
    orgId: string,
    spaceId: string,
    orderedIds: string[],
  ): Promise<SpaceDetail> {
    for (let i = 0; i < orderedIds.length; i++) {
      await this.db
        .update(spaceLinks)
        .set({ seq: i })
        .where(
          and(
            eq(spaceLinks.orgId, orgId),
            eq(spaceLinks.spaceId, spaceId),
            eq(spaceLinks.id, orderedIds[i]!),
          ),
        );
    }
    const space = await this.findSpace(orgId, spaceId);
    if (!space) {
      throw new NotFoundError("Space", spaceId);
    }
    return space;
  }

  async spacesLinkingContent(orgId: string, contentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ spaceId: spaceLinks.spaceId })
      .from(spaceLinks)
      .where(and(eq(spaceLinks.orgId, orgId), eq(spaceLinks.contentId, contentId)));
    return [...new Set(rows.map((row) => row.spaceId))];
  }

  private async withSpaceParts(orgId: string, rows: Space[]): Promise<SpaceDetail[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row) => row.id);
    const topics = await this.db
      .select()
      .from(spaceTopics)
      .where(and(eq(spaceTopics.orgId, orgId), inArray(spaceTopics.spaceId, ids)))
      .orderBy(asc(spaceTopics.seq));
    const links = await this.db
      .select()
      .from(spaceLinks)
      .where(and(eq(spaceLinks.orgId, orgId), inArray(spaceLinks.spaceId, ids)))
      .orderBy(asc(spaceLinks.seq));
    return rows.map((space) => ({
      ...space,
      topics: topics.filter((topic) => topic.spaceId === space.id),
      links: links.filter((link) => link.spaceId === space.id),
    }));
  }
}
translateDbErrors(DrizzleContentRepository);
