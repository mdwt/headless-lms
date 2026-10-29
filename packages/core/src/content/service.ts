import type {
  Activity,
  ActivityAsset,
  ActivityView,
  Bundle,
  BundleItem,
  Community,
  CommunityView,
  CourseSettings,
  CourseView,
  DmSettings,
  DownloadAsset,
  DownloadFile,
  DownloadView,
  Module,
  SaveActivityInput,
  Space,
  SpaceDetail,
  SpaceSettings,
} from './model.js';
import type {
  BundlesService,
  CommunitiesService,
  CourseManagementService,
  ContentRepository,
  ContentUnitOfWork,
  DownloadablesService,
} from './ports.js';
import type {
  AddDownloadAssetInput,
  CreateBundleInput,
  CreateCommunityInput,
  CreateCourseInput,
  CreateDownloadInput,
  CreateSpaceInput,
  ListBundlesQuery,
  ListCommunitiesQuery,
  ListCoursesQuery,
  ListDownloadsQuery,
  Page,
  PatchDmSettingsInput,
  SetSpaceTopicsInput,
  UpdateBundleInput,
  UpdateCommunityInput,
  UpdateCourseInput,
  UpdateDownloadInput,
  UpdateSpaceInput,
} from './types.js';
import { contentEvents } from './events.js';
import type { Actor } from '../shared/actor.js';
import type { AssetFiles, FileUrls, LibraryAssetReader } from '../assets/index.js';
import type { Logger, NewDomainEvent } from '../shared/ports.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../shared/errors.js';
import { noopLogger } from '../shared/logger.js';
import { spaceSettingsDefaults } from '../types/schemas/content.js';

/** URL-safe slug derived from a title. Domain rule owned by the service. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export type ContentServiceParams = {
  repo: ContentRepository;
  uow: ContentUnitOfWork;
  libraryAssets: LibraryAssetReader;
  files: Pick<AssetFiles, 'readyFiles'>;
  fileUrls: FileUrls;
  logger?: Logger;
};

function actorMetadata(actor: Actor): { actorOrgUserId: string } {
  return { actorOrgUserId: actor.id };
}

function assertConfigurator(actor: Actor): void {
  if (actor.role !== 'owner' && actor.role !== 'admin') {
    throw new ForbiddenError('Only an owner or an admin can configure a community');
  }
}

type WithThumbnail = {
  id: string;
  type: 'course' | 'download' | 'community';
  thumbnailAssetId: string | null;
};

function sameIdSet(current: string[], requested: string[]): boolean {
  if (current.length !== requested.length) {
    return false;
  }
  const have = new Set(current);
  return requested.every((id) => have.has(id)) && new Set(requested).size === requested.length;
}

export class ContentService
  implements CourseManagementService, DownloadablesService, BundlesService, CommunitiesService
{
  private readonly repo: ContentRepository;
  private readonly uow: ContentUnitOfWork;
  private readonly libraryAssets: LibraryAssetReader;
  private readonly files: Pick<AssetFiles, 'readyFiles'>;
  private readonly fileUrls: FileUrls;
  private readonly logger: Logger;

  constructor(params: ContentServiceParams) {
    this.repo = params.repo;
    this.uow = params.uow;
    this.libraryAssets = params.libraryAssets;
    this.files = params.files;
    this.fileUrls = params.fileUrls;
    this.logger = params.logger ?? noopLogger;
  }

  private withThumbnail<T extends WithThumbnail>(item: T): T & { thumbnailUrl: string | null } {
    return {
      ...item,
      thumbnailUrl: item.thumbnailAssetId ? this.fileUrls.thumbnail(item.type, item.id) : null,
    };
  }

  private pageWithThumbnails<T extends WithThumbnail>(
    page: Page<T>,
  ): Page<T & { thumbnailUrl: string | null }> {
    return { ...page, rows: page.rows.map((row) => this.withThumbnail(row)) };
  }

  private async downloadFiles(orgId: string, links: DownloadAsset[]): Promise<DownloadFile[]> {
    const ready = await this.files.readyFiles(
      orgId,
      links.map((link) => link.assetId),
    );
    return links.flatMap((link) => {
      const file = ready[link.assetId];
      return file
        ? [{ ...link, ...file, url: this.fileUrls.downloadFile(link.downloadId, link.assetId) }]
        : [];
    });
  }

  async listCourses(orgId: string, query: ListCoursesQuery): Promise<Page<CourseView>> {
    return this.pageWithThumbnails(await this.repo.listCourses(orgId, query));
  }

  async getCourse(orgId: string, id: string): Promise<CourseView | null> {
    const course = await this.repo.findCourseById(orgId, id);
    return course ? this.withThumbnail(course) : null;
  }

  async createCourse(orgId: string, input: CreateCourseInput): Promise<CourseView> {
    const course = await this.uow.run(async ({ content, outbox }) => {
      const created = await content.createCourse(orgId, input, slugify(input.title));
      await outbox.append([contentEvents.courseCreated.make({ orgId, data: created })]);
      return created;
    });
    this.logger.info('course created', { orgId, courseId: course.id, title: course.title });
    return this.withThumbnail(course);
  }

  async updateCourse(orgId: string, id: string, patch: UpdateCourseInput): Promise<CourseView> {
    await this.assertLibraryAssets(orgId, [patch.thumbnailAssetId], 'A course');
    const course = await this.uow.run(async ({ content, outbox }) => {
      const updated = await content.updateCourse(orgId, id, patch);
      if (!updated) {
        this.logger.warn('course update rejected — not found', { orgId, courseId: id });
        throw new NotFoundError('Course', id);
      }
      await outbox.append([contentEvents.courseUpdated.make({ orgId, data: updated })]);
      return updated;
    });
    this.logger.info('course updated', { orgId, courseId: id, fields: Object.keys(patch) });
    return this.withThumbnail(course);
  }

  async patchCourseSettings(
    orgId: string,
    id: string,
    value: Partial<CourseSettings>,
  ): Promise<CourseSettings> {
    const merged = await this.uow.run(async ({ content, outbox }) => {
      const course = await content.findCourseById(orgId, id);
      if (!course) {
        this.logger.warn('course settings patch rejected — not found', { orgId, courseId: id });
        throw new NotFoundError('Course', id);
      }
      const settings = await content.patchCourseSettings(orgId, id, value);
      await outbox.append([
        contentEvents.courseUpdated.make({ orgId, data: { ...course, settings } }),
      ]);
      return settings;
    });
    this.logger.info('course settings patched', { orgId, courseId: id, value });
    return merged;
  }

  async deleteCourse(orgId: string, id: string, actor: Actor): Promise<void> {
    await this.uow.run(async ({ content, outbox }) => {
      // Snapshot before the delete — the event carries the last known state.
      const course = await content.findCourseById(orgId, id);
      if (!course) {
        this.logger.warn('course delete rejected — not found', { orgId, courseId: id });
        throw new NotFoundError('Course', id);
      }
      const linked = await content.spacesLinkingContent(orgId, id);
      const ok = await content.deleteCourse(orgId, id);
      if (!ok) {
        throw new NotFoundError('Course', id);
      }
      await outbox.append([
        contentEvents.courseDeleted.make({ orgId, data: course }),
        ...(await this.spaceUpdates(content, orgId, linked, actor)),
      ]);
    });
    this.logger.info('course deleted', { orgId, courseId: id });
  }

  // --- modules & activities ------------------------------------------------

  listCourseModules(orgId: string, courseId: string): Promise<Module[]> {
    return this.repo.listCourseModules(orgId, courseId);
  }
  listCourseActivities(orgId: string, courseId: string): Promise<Activity[]> {
    return this.repo.listActivitiesForCourse(orgId, courseId);
  }
  async listCourseActivityViews(orgId: string, courseId: string): Promise<ActivityView[]> {
    const [activities, links] = await Promise.all([
      this.repo.listActivitiesForCourse(orgId, courseId),
      this.repo.listActivityAssetsForCourse(orgId, courseId),
    ]);
    return activities.map((activity) => ({
      ...activity,
      assetUrls: Object.fromEntries(
        links
          .filter((link) => link.activityId === activity.id)
          .map((link) => [link.assetId, this.fileUrls.activityAsset(activity.id, link.assetId)]),
      ),
    }));
  }
  listCourseActivityAssets(orgId: string, courseId: string): Promise<ActivityAsset[]> {
    return this.repo.listActivityAssetsForCourse(orgId, courseId);
  }
  getActivity(orgId: string, activityId: string): Promise<Activity | null> {
    return this.repo.findActivity(orgId, activityId);
  }
  getModule(orgId: string, moduleId: string): Promise<Module | null> {
    return this.repo.findModule(orgId, moduleId);
  }

  async reorderModules(orgId: string, courseId: string, orderedIds: string[]): Promise<Module[]> {
    const modules = await this.uow.run(async ({ content, outbox }) => {
      const reordered = await content.reorderModules(orgId, courseId, orderedIds);
      await outbox.append([contentEvents.modulesReordered.make({ orgId, data: reordered })]);
      return reordered;
    });
    this.logger.debug('modules reordered', {
      orgId,
      courseId,
      moduleIds: modules.map((m) => m.id),
    });
    return modules;
  }

  async createModule(orgId: string, courseId: string, title: string): Promise<Module[]> {
    const { modules, created } = await this.uow.run(async ({ content, outbox }) => {
      const all = await content.createModule(orgId, courseId, title);
      // The list is ordered by seq and the new module is appended at max(seq)+1.
      const module = all.at(-1);
      if (!module) {
        throw new Error('failed to load created module');
      }
      await outbox.append([contentEvents.moduleCreated.make({ orgId, data: module })]);
      return { modules: all, created: module };
    });
    this.logger.info('module created', { orgId, courseId, moduleId: created.id, title });
    return modules;
  }

  async updateModule(
    orgId: string,
    courseId: string,
    moduleId: string,
    title: string,
  ): Promise<Module[]> {
    const modules = await this.uow.run(async ({ content, outbox }) => {
      const existing = await content.findModule(orgId, moduleId);
      if (!existing || existing.courseId !== courseId) {
        this.logger.warn('module update rejected — not found in course', {
          orgId,
          courseId,
          moduleId,
        });
        throw new NotFoundError('Module', moduleId);
      }
      const all = await content.updateModule(orgId, courseId, moduleId, title);
      const module = all.find((m) => m.id === moduleId);
      if (!module) {
        throw new NotFoundError('Module', moduleId);
      }
      await outbox.append([contentEvents.moduleUpdated.make({ orgId, data: module })]);
      return all;
    });
    this.logger.info('module updated', { orgId, courseId, moduleId, title });
    return modules;
  }

  async deleteModule(orgId: string, courseId: string, moduleId: string): Promise<Module[]> {
    const modules = await this.uow.run(async ({ content, outbox }) => {
      // Snapshot before the delete — the event carries the last known state.
      const module = await content.findModule(orgId, moduleId);
      if (!module || module.courseId !== courseId) {
        this.logger.warn('module delete rejected — not found in course', {
          orgId,
          courseId,
          moduleId,
        });
        throw new NotFoundError('Module', moduleId);
      }
      const remaining = await content.deleteModule(orgId, courseId, moduleId);
      await outbox.append([contentEvents.moduleDeleted.make({ orgId, data: module })]);
      return remaining;
    });
    this.logger.info('module deleted', { orgId, courseId, moduleId });
    return modules;
  }

  async reorderActivities(
    orgId: string,
    courseId: string,
    moduleId: string,
    orderedIds: string[],
  ): Promise<Module[]> {
    const modules = await this.uow.run(async ({ content, outbox }) => {
      const reordered = await content.reorderActivities(orgId, courseId, moduleId, orderedIds);
      const module = reordered.find((m) => m.id === moduleId);
      if (!module) {
        throw new NotFoundError('Module', moduleId);
      }
      await outbox.append([contentEvents.activitiesReordered.make({ orgId, data: module })]);
      return reordered;
    });
    this.logger.debug('activities reordered', { orgId, courseId, moduleId });
    return modules;
  }

  private async assertLibraryAssets(
    orgId: string,
    assetIds: (string | null | undefined)[],
    user = 'An activity',
  ): Promise<void> {
    const ids = assetIds.filter((id): id is string => typeof id === 'string');
    if (ids.length === 0) {
      return;
    }
    const library = new Set(await this.libraryAssets.libraryAssetsAmong(orgId, ids));
    const refused = ids.filter((id) => !library.has(id));
    if (refused.length > 0) {
      this.logger.warn('library assets refused', { orgId, assetIds: refused });
      throw new ConflictError(
        `${user} can only use ready files from the media library. Not available: ${refused.join(', ')}`,
      );
    }
  }

  async saveActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    input: SaveActivityInput,
    activityId?: string,
  ): Promise<Module[]> {
    await this.assertLibraryAssets(orgId, input.assetIds ?? []);
    const { modules, activity } = await this.uow.run(async ({ content, outbox }) => {
      if (activityId) {
        const existing = await content.findActivity(orgId, activityId);
        if (!existing || existing.moduleId !== moduleId || existing.courseId !== courseId) {
          this.logger.warn('activity update rejected — not found in module', {
            orgId,
            courseId,
            moduleId,
            activityId,
          });
          throw new NotFoundError('Activity', activityId);
        }
      } else {
        const module = await content.findModule(orgId, moduleId);
        if (!module || module.courseId !== courseId) {
          this.logger.warn('activity create rejected — module not found in course', {
            orgId,
            courseId,
            moduleId,
          });
          throw new NotFoundError('Module', moduleId);
        }
      }

      const { modules: all, activity: saved } = await content.saveActivity(
        orgId,
        courseId,
        moduleId,
        input,
        activityId,
      );
      await outbox.append([
        activityId
          ? contentEvents.activityUpdated.make({ orgId, data: saved })
          : contentEvents.activityCreated.make({ orgId, data: saved }),
      ]);
      return { modules: all, activity: saved };
    });
    this.logger.info(activityId ? 'activity updated' : 'activity created', {
      orgId,
      courseId,
      moduleId,
      activityId: activity.id,
    });
    return modules;
  }

  async deleteActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    activityId: string,
  ): Promise<Module[]> {
    const modules = await this.uow.run(async ({ content, outbox }) => {
      // Snapshot before the delete — the event carries the last known state.
      const activity = await content.findActivity(orgId, activityId);
      if (!activity || activity.moduleId !== moduleId || activity.courseId !== courseId) {
        this.logger.warn('activity delete rejected — not found in module', {
          orgId,
          courseId,
          moduleId,
          activityId,
        });
        throw new NotFoundError('Activity', activityId);
      }
      const remaining = await content.deleteActivity(orgId, courseId, moduleId, activityId);
      await outbox.append([contentEvents.activityDeleted.make({ orgId, data: activity })]);
      return remaining;
    });
    this.logger.info('activity deleted', { orgId, courseId, moduleId, activityId });
    return modules;
  }

  // --- downloads ------------------------------------------------------------

  async listDownloads(orgId: string, query: ListDownloadsQuery): Promise<Page<DownloadView>> {
    return this.pageWithThumbnails(await this.repo.listDownloads(orgId, query));
  }

  async getDownload(orgId: string, id: string): Promise<DownloadView | null> {
    const download = await this.repo.getDownload(orgId, id);
    return download ? this.withThumbnail(download) : null;
  }

  async createDownload(orgId: string, input: CreateDownloadInput): Promise<DownloadView> {
    const download = await this.uow.run(async ({ content, outbox }) => {
      const created = await content.createDownload(orgId, input, slugify(input.title));
      await outbox.append([contentEvents.downloadCreated.make({ orgId, data: created })]);
      return created;
    });
    this.logger.info('download created', { orgId, downloadId: download.id, title: download.title });
    return this.withThumbnail(download);
  }

  async updateDownload(
    orgId: string,
    id: string,
    patch: UpdateDownloadInput,
  ): Promise<DownloadView> {
    await this.assertLibraryAssets(orgId, [patch.thumbnailAssetId], 'A download');
    const download = await this.uow.run(async ({ content, outbox }) => {
      const updated = await content.updateDownload(orgId, id, patch);
      if (!updated) {
        this.logger.warn('download update rejected — not found', { orgId, downloadId: id });
        throw new NotFoundError('Download', id);
      }
      await outbox.append([contentEvents.downloadUpdated.make({ orgId, data: updated })]);
      return updated;
    });
    this.logger.info('download updated', { orgId, downloadId: id, fields: Object.keys(patch) });
    return this.withThumbnail(download);
  }

  async removeDownload(orgId: string, id: string, actor: Actor): Promise<void> {
    await this.uow.run(async ({ content, outbox }) => {
      // Snapshot before the delete — the event carries the last known state.
      const download = await content.getDownload(orgId, id);
      if (!download) {
        this.logger.warn('download delete rejected — not found', { orgId, downloadId: id });
        throw new NotFoundError('Download', id);
      }
      const linked = await content.spacesLinkingContent(orgId, id);
      const ok = await content.deleteDownload(orgId, id);
      if (!ok) {
        throw new NotFoundError('Download', id);
      }
      await outbox.append([
        contentEvents.downloadDeleted.make({ orgId, data: download }),
        ...(await this.spaceUpdates(content, orgId, linked, actor)),
      ]);
    });
    this.logger.info('download deleted', { orgId, downloadId: id });
  }

  // --- download asset links ------------------------------------------------

  async listDownloadAssets(orgId: string, downloadId: string): Promise<DownloadFile[]> {
    return this.downloadFiles(orgId, await this.repo.listDownloadAssets(orgId, downloadId));
  }

  async addDownloadAsset(
    orgId: string,
    downloadId: string,
    input: AddDownloadAssetInput,
  ): Promise<DownloadFile[]> {
    await this.assertLibraryAssets(orgId, [input.assetId], 'A download');
    const assets = await this.uow.run(async ({ content, outbox }) => {
      const assets = await content.addDownloadAsset(orgId, downloadId, input);
      await outbox.append([
        contentEvents.downloadAssetAdded.make({ orgId, data: { downloadId, assets } }),
      ]);
      return assets;
    });
    this.logger.info('download asset added', { orgId, downloadId, assetId: input.assetId });
    return this.downloadFiles(orgId, assets);
  }

  async removeDownloadAsset(
    orgId: string,
    downloadId: string,
    assetId: string,
  ): Promise<DownloadFile[]> {
    const assets = await this.uow.run(async ({ content, outbox }) => {
      const assets = await content.removeDownloadAsset(orgId, downloadId, assetId);
      await outbox.append([
        contentEvents.downloadAssetRemoved.make({ orgId, data: { downloadId, assets } }),
      ]);
      return assets;
    });
    this.logger.info('download asset removed', { orgId, downloadId, assetId });
    return this.downloadFiles(orgId, assets);
  }

  async renameDownloadAsset(
    orgId: string,
    downloadId: string,
    assetId: string,
    displayName: string | null,
  ): Promise<DownloadFile[]> {
    const assets = await this.uow.run(async ({ content, outbox }) => {
      const assets = await content.renameDownloadAsset(orgId, downloadId, assetId, displayName);
      await outbox.append([
        contentEvents.downloadAssetRenamed.make({ orgId, data: { downloadId, assets } }),
      ]);
      return assets;
    });
    this.logger.info('download asset renamed', { orgId, downloadId, assetId });
    return this.downloadFiles(orgId, assets);
  }

  /** The caller must send the COMPLETE ordered set — a partial list would
   *  silently unlink whatever it omitted. */
  async reorderDownloadAssets(
    orgId: string,
    downloadId: string,
    assetIds: string[],
  ): Promise<DownloadFile[]> {
    const assets = await this.uow.run(async ({ content, outbox }) => {
      const current = await content.listDownloadAssets(orgId, downloadId);
      const currentIds = new Set(current.map((a) => a.assetId));
      const requestedIds = new Set(assetIds);
      if (
        requestedIds.size !== assetIds.length ||
        requestedIds.size !== currentIds.size ||
        !assetIds.every((id) => currentIds.has(id))
      ) {
        this.logger.warn('download asset reorder rejected — id set mismatch', {
          orgId,
          downloadId,
          assetIds,
          currentIds: [...currentIds],
        });
        throw new ConflictError("Ordered asset ids does not match the download's current assets");
      }
      const assets = await content.reorderDownloadAssets(orgId, downloadId, assetIds);
      await outbox.append([
        contentEvents.downloadAssetsReordered.make({ orgId, data: { downloadId, assets } }),
      ]);
      return assets;
    });
    this.logger.debug('download assets reordered', { orgId, downloadId });
    return this.downloadFiles(orgId, assets);
  }

  // --- bundles --------------------------------------------------------------

  listBundles(orgId: string, query: ListBundlesQuery): Promise<Page<Bundle>> {
    return this.repo.listBundles(orgId, query);
  }

  getBundle(orgId: string, id: string): Promise<Bundle | null> {
    return this.repo.findBundleById(orgId, id);
  }

  async createBundle(orgId: string, input: CreateBundleInput): Promise<Bundle> {
    const { bundle, items } = await this.uow.run(async ({ content, outbox }) => {
      // The repository writes the bundle and its initial items as one unit —
      // an unknown content id throws and nothing is created.
      const created = await content.createBundle(orgId, input);
      const initial = input.contentIds?.length
        ? await content.listBundleItems(orgId, created.id)
        : [];
      await outbox.append([
        contentEvents.bundleCreated.make({ orgId, data: created }),
        ...(initial.length > 0
          ? [
              contentEvents.bundleItemAdded.make({
                orgId,
                data: { bundleId: created.id, items: initial },
              }),
            ]
          : []),
      ]);
      return { bundle: created, items: initial };
    });
    this.logger.info('bundle created', {
      orgId,
      bundleId: bundle.id,
      name: bundle.name,
      itemCount: items.length,
    });
    return bundle;
  }

  async updateBundle(orgId: string, id: string, patch: UpdateBundleInput): Promise<Bundle> {
    const bundle = await this.uow.run(async ({ content, outbox }) => {
      const updated = await content.updateBundle(orgId, id, patch);
      if (!updated) {
        this.logger.warn('bundle update rejected — not found', { orgId, bundleId: id });
        throw new NotFoundError('Bundle', id);
      }
      await outbox.append([contentEvents.bundleUpdated.make({ orgId, data: updated })]);
      return updated;
    });
    this.logger.info('bundle updated', { orgId, bundleId: id, fields: Object.keys(patch) });
    return bundle;
  }

  async deleteBundle(orgId: string, id: string): Promise<void> {
    await this.uow.run(async ({ content, outbox }) => {
      // Snapshot before the delete — the event carries the last known state.
      const bundle = await content.findBundleById(orgId, id);
      if (!bundle) {
        this.logger.warn('bundle delete rejected — not found', { orgId, bundleId: id });
        throw new NotFoundError('Bundle', id);
      }
      const ok = await content.deleteBundle(orgId, id);
      if (!ok) {
        throw new NotFoundError('Bundle', id);
      }
      await outbox.append([contentEvents.bundleDeleted.make({ orgId, data: bundle })]);
    });
    this.logger.info('bundle deleted', { orgId, bundleId: id });
  }

  listBundleItems(orgId: string, bundleId: string): Promise<BundleItem[]> {
    return this.repo.listBundleItems(orgId, bundleId);
  }

  async addBundleItem(orgId: string, bundleId: string, contentId: string): Promise<BundleItem[]> {
    const items = await this.uow.run(async ({ content, outbox }) => {
      const all = await content.addBundleItem(orgId, bundleId, contentId);
      await outbox.append([
        contentEvents.bundleItemAdded.make({ orgId, data: { bundleId, items: all } }),
      ]);
      return all;
    });
    this.logger.info('bundle item added', { orgId, bundleId, contentId });
    return items;
  }

  async removeBundleItem(
    orgId: string,
    bundleId: string,
    contentId: string,
  ): Promise<BundleItem[]> {
    const items = await this.uow.run(async ({ content, outbox }) => {
      const all = await content.removeBundleItem(orgId, bundleId, contentId);
      await outbox.append([
        contentEvents.bundleItemRemoved.make({ orgId, data: { bundleId, items: all } }),
      ]);
      return all;
    });
    this.logger.info('bundle item removed', { orgId, bundleId, contentId });
    return items;
  }

  private async spaceUpdates(
    content: ContentRepository,
    orgId: string,
    spaceIds: string[],
    actor: Actor,
  ): Promise<NewDomainEvent[]> {
    const events: NewDomainEvent[] = [];
    for (const spaceId of spaceIds) {
      const space = await content.findSpace(orgId, spaceId);
      if (space) {
        events.push(
          contentEvents.spaceUpdated.make({ orgId, data: space, metadata: actorMetadata(actor) }),
        );
      }
    }
    return events;
  }

  private resolvedSpace(
    input: CreateSpaceInput | UpdateSpaceInput,
    current?: Space,
  ): {
    accessRule: Space['accessRule'];
    capacity: number | null;
    settings: SpaceSettings;
  } {
    const accessRule = input.accessRule ?? current?.accessRule ?? 'all_members';
    let capacity = input.capacity !== undefined ? input.capacity : (current?.capacity ?? null);
    if (accessRule === 'all_members') {
      if (input.capacity != null) {
        throw new ConflictError('An all-members space has no capacity');
      }
      capacity = null;
    }
    const settings = {
      ...(current?.settings ?? spaceSettingsDefaults),
      ...input.settings,
    };
    return { accessRule, capacity, settings };
  }

  async listCommunities(orgId: string, query: ListCommunitiesQuery): Promise<Page<CommunityView>> {
    return this.pageWithThumbnails(await this.repo.listCommunities(orgId, query));
  }

  async getCommunity(orgId: string, id: string): Promise<CommunityView | null> {
    const community = await this.repo.findCommunityById(orgId, id);
    return community ? this.withThumbnail(community) : null;
  }

  listPublishedCommunityIds(orgId: string): Promise<string[]> {
    return this.repo.listPublishedCommunityIds(orgId);
  }

  listCommunitiesById(orgId: string, ids: string[]): Promise<Community[]> {
    return ids.length ? this.repo.findCommunitiesByIds(orgId, ids) : Promise.resolve([]);
  }

  getSpace(orgId: string, spaceId: string): Promise<SpaceDetail | null> {
    return this.repo.findSpace(orgId, spaceId);
  }

  async getCommunitySpace(
    orgId: string,
    communityId: string,
    spaceId: string,
  ): Promise<SpaceDetail | null> {
    const space = await this.repo.findSpace(orgId, spaceId);
    return space?.communityId === communityId ? space : null;
  }

  async listSpaces(orgId: string, communityId: string): Promise<SpaceDetail[]> {
    if (!(await this.getCommunity(orgId, communityId))) {
      throw new NotFoundError('Community', communityId);
    }
    return this.repo.listSpaces(orgId, communityId);
  }

  async getDmSettings(orgId: string, communityId: string): Promise<DmSettings | null> {
    const community = await this.repo.findCommunityById(orgId, communityId);
    return community?.settings.dm ?? null;
  }

  async createCommunity(
    orgId: string,
    input: CreateCommunityInput,
    actor: Actor,
  ): Promise<CommunityView> {
    assertConfigurator(actor);
    const community = await this.uow.run(async ({ content, outbox }) => {
      const created = await content.createCommunity(orgId, input, slugify(input.title));
      await outbox.append([
        contentEvents.communityCreated.make({
          orgId,
          data: created,
          metadata: actorMetadata(actor),
        }),
      ]);
      return created;
    });
    this.logger.info('community created', { orgId, communityId: community.id });
    return this.withThumbnail(community);
  }

  async updateCommunity(
    orgId: string,
    id: string,
    patch: UpdateCommunityInput,
    actor: Actor,
  ): Promise<CommunityView> {
    assertConfigurator(actor);
    await this.assertLibraryAssets(orgId, [patch.thumbnailAssetId], 'A community');
    const community = await this.uow.run(async ({ content, outbox }) => {
      const updated = await content.updateCommunity(orgId, id, patch);
      if (!updated) {
        throw new NotFoundError('Community', id);
      }
      await outbox.append([
        contentEvents.communityUpdated.make({
          orgId,
          data: updated,
          metadata: actorMetadata(actor),
        }),
      ]);
      return updated;
    });
    this.logger.info('community updated', { orgId, communityId: id });
    return this.withThumbnail(community);
  }

  publishCommunity(orgId: string, id: string, actor: Actor): Promise<CommunityView> {
    return this.updateCommunity(orgId, id, { status: 'published' }, actor);
  }

  unpublishCommunity(orgId: string, id: string, actor: Actor): Promise<CommunityView> {
    return this.updateCommunity(orgId, id, { status: 'draft' }, actor);
  }

  async deleteCommunity(orgId: string, id: string, actor: Actor): Promise<void> {
    assertConfigurator(actor);
    await this.uow.run(async ({ content, outbox }) => {
      const community = await content.findCommunityById(orgId, id);
      if (!community) {
        throw new NotFoundError('Community', id);
      }
      const linked = await content.spacesLinkingContent(orgId, id);
      const ok = await content.deleteCommunity(orgId, id);
      if (!ok) {
        throw new NotFoundError('Community', id);
      }
      await content.deleteCommunitySettings(orgId, id);
      await outbox.append([
        contentEvents.communityDeleted.make({
          orgId,
          data: community,
          metadata: actorMetadata(actor),
        }),
        ...(await this.spaceUpdates(content, orgId, linked, actor)),
      ]);
    });
    this.logger.info('community deleted', { orgId, communityId: id });
  }

  async patchDmSettings(
    orgId: string,
    id: string,
    patch: PatchDmSettingsInput,
    actor: Actor,
  ): Promise<CommunityView> {
    assertConfigurator(actor);
    const community = await this.uow.run(async ({ content, outbox }) => {
      const updated = await content.patchDmSettings(orgId, id, patch);
      if (!updated) {
        throw new NotFoundError('Community', id);
      }
      await outbox.append([
        contentEvents.communityUpdated.make({
          orgId,
          data: updated,
          metadata: actorMetadata(actor),
        }),
      ]);
      return updated;
    });
    this.logger.info('community dm settings patched', { orgId, communityId: id });
    return this.withThumbnail(community);
  }

  async createSpace(
    orgId: string,
    communityId: string,
    input: CreateSpaceInput,
    actor: Actor,
  ): Promise<SpaceDetail> {
    assertConfigurator(actor);
    const resolved = this.resolvedSpace(input);
    const space = await this.uow.run(async ({ content, outbox }) => {
      const community = await content.findCommunityById(orgId, communityId);
      if (!community) {
        throw new NotFoundError('Community', communityId);
      }
      const created = await content.createSpace(orgId, communityId, {
        ...input,
        accessRule: resolved.accessRule,
        capacity: resolved.capacity,
        settings: resolved.settings,
      });
      await outbox.append([
        contentEvents.spaceCreated.make({
          orgId,
          data: created,
          metadata: actorMetadata(actor),
        }),
      ]);
      return created;
    });
    this.logger.info('space created', { orgId, communityId, spaceId: space.id });
    return space;
  }

  async updateSpace(
    orgId: string,
    communityId: string,
    spaceId: string,
    patch: UpdateSpaceInput,
    actor: Actor,
  ): Promise<SpaceDetail> {
    assertConfigurator(actor);
    const space = await this.uow.run(async ({ content, outbox }) => {
      const current = await content.findSpace(orgId, spaceId);
      if (!current || current.communityId !== communityId) {
        throw new NotFoundError('Space', spaceId);
      }
      const resolved = this.resolvedSpace(patch, current);
      const updated = await content.updateSpace(orgId, communityId, spaceId, {
        ...patch,
        accessRule: resolved.accessRule,
        capacity: resolved.capacity,
        settings: resolved.settings,
      });
      if (!updated) {
        throw new NotFoundError('Space', spaceId);
      }
      await outbox.append([
        contentEvents.spaceUpdated.make({
          orgId,
          data: updated,
          metadata: actorMetadata(actor),
        }),
      ]);
      return updated;
    });
    this.logger.info('space updated', { orgId, communityId, spaceId });
    return space;
  }

  async deleteSpace(
    orgId: string,
    communityId: string,
    spaceId: string,
    actor: Actor,
  ): Promise<void> {
    assertConfigurator(actor);
    await this.uow.run(async ({ content, outbox }) => {
      const space = await content.findSpace(orgId, spaceId);
      if (!space || space.communityId !== communityId) {
        throw new NotFoundError('Space', spaceId);
      }
      const ok = await content.deleteSpace(orgId, communityId, spaceId);
      if (!ok) {
        throw new NotFoundError('Space', spaceId);
      }
      await outbox.append([
        contentEvents.spaceDeleted.make({
          orgId,
          data: space,
          metadata: actorMetadata(actor),
        }),
      ]);
    });
    this.logger.info('space deleted', { orgId, communityId, spaceId });
  }

  async reorderSpaces(
    orgId: string,
    communityId: string,
    orderedIds: string[],
    actor: Actor,
  ): Promise<SpaceDetail[]> {
    assertConfigurator(actor);
    const spaces = await this.uow.run(async ({ content, outbox }) => {
      const community = await content.findCommunityById(orgId, communityId);
      if (!community) {
        throw new NotFoundError('Community', communityId);
      }
      const current = await content.listSpaces(orgId, communityId);
      if (
        !sameIdSet(
          current.map((space) => space.id),
          orderedIds,
        )
      ) {
        throw new ConflictError("Ordered space ids do not match the community's spaces");
      }
      const reordered = await content.reorderSpaces(orgId, communityId, orderedIds);
      await outbox.append([
        contentEvents.spacesReordered.make({
          orgId,
          data: reordered,
          metadata: actorMetadata(actor),
        }),
      ]);
      return reordered;
    });
    this.logger.info('spaces reordered', { orgId, communityId });
    return spaces;
  }

  async setSpaceTopics(
    orgId: string,
    communityId: string,
    spaceId: string,
    input: SetSpaceTopicsInput,
    actor: Actor,
  ): Promise<SpaceDetail> {
    assertConfigurator(actor);
    const names = input.topics.map((topic) => topic.name);
    if (new Set(names).size !== names.length) {
      throw new ConflictError('A space topic name is already used');
    }
    const space = await this.uow.run(async ({ content, outbox }) => {
      const locked = await content.lockSpace(orgId, spaceId);
      if (!locked || locked.communityId !== communityId) {
        throw new NotFoundError('Space', spaceId);
      }
      const current = await content.findSpace(orgId, spaceId);
      if (!current) {
        throw new NotFoundError('Space', spaceId);
      }
      const kept = new Set(input.topics.flatMap((topic) => (topic.id ? [topic.id] : [])));
      const removed = current.topics
        .filter((topic) => !kept.has(topic.id))
        .map((topic) => topic.id);
      if (removed.length > 0 && (await content.topicsInUse(orgId, spaceId, removed)).length > 0) {
        throw new ConflictError('A topic used by a post cannot be removed');
      }
      const updated = await content.setSpaceTopics(orgId, spaceId, input);
      await outbox.append([
        contentEvents.spaceUpdated.make({
          orgId,
          data: updated,
          metadata: actorMetadata(actor),
        }),
      ]);
      return updated;
    });
    this.logger.info('space topics set', { orgId, communityId, spaceId });
    return space;
  }

  async addSpaceLink(
    orgId: string,
    communityId: string,
    spaceId: string,
    contentId: string,
    actor: Actor,
  ): Promise<SpaceDetail> {
    assertConfigurator(actor);
    const space = await this.uow.run(async ({ content, outbox }) => {
      const current = await content.findSpace(orgId, spaceId);
      if (!current || current.communityId !== communityId) {
        throw new NotFoundError('Space', spaceId);
      }
      if (current.links.some((link) => link.contentId === contentId)) {
        throw new ConflictError('This space already links to that content');
      }
      const updated = await content.addSpaceLink(orgId, spaceId, contentId);
      await outbox.append([
        contentEvents.spaceUpdated.make({
          orgId,
          data: updated,
          metadata: actorMetadata(actor),
        }),
      ]);
      return updated;
    });
    this.logger.info('space link added', { orgId, communityId, spaceId, contentId });
    return space;
  }

  async removeSpaceLink(
    orgId: string,
    communityId: string,
    spaceId: string,
    linkId: string,
    actor: Actor,
  ): Promise<SpaceDetail> {
    assertConfigurator(actor);
    const space = await this.uow.run(async ({ content, outbox }) => {
      const current = await content.findSpace(orgId, spaceId);
      if (!current || current.communityId !== communityId) {
        throw new NotFoundError('Space', spaceId);
      }
      const updated = await content.removeSpaceLink(orgId, spaceId, linkId);
      await outbox.append([
        contentEvents.spaceUpdated.make({
          orgId,
          data: updated,
          metadata: actorMetadata(actor),
        }),
      ]);
      return updated;
    });
    this.logger.info('space link removed', { orgId, communityId, spaceId, linkId });
    return space;
  }

  async reorderSpaceLinks(
    orgId: string,
    communityId: string,
    spaceId: string,
    orderedIds: string[],
    actor: Actor,
  ): Promise<SpaceDetail> {
    assertConfigurator(actor);
    const space = await this.uow.run(async ({ content, outbox }) => {
      const current = await content.findSpace(orgId, spaceId);
      if (!current || current.communityId !== communityId) {
        throw new NotFoundError('Space', spaceId);
      }
      if (
        !sameIdSet(
          current.links.map((link) => link.id),
          orderedIds,
        )
      ) {
        throw new ConflictError("Ordered link ids do not match the space's links");
      }
      const updated = await content.reorderSpaceLinks(orgId, spaceId, orderedIds);
      await outbox.append([
        contentEvents.spaceUpdated.make({
          orgId,
          data: updated,
          metadata: actorMetadata(actor),
        }),
      ]);
      return updated;
    });
    this.logger.info('space links reordered', { orgId, communityId, spaceId });
    return space;
  }
}
