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
  Event,
  EventAsset,
  EventFile,
  EventLead,
  EventView,
  Module,
  SaveActivityInput,
  Space,
  SpaceDetail,
  SpaceSettings,
  SpaceView,
} from './model.js';
import type {
  BundlesService,
  CommunitiesService,
  CommunityDigest,
  CourseManagementService,
  ContentAssetReader,
  ContentRepository,
  ContentUnitOfWork,
  DownloadablesService,
  EventsService,
} from './ports.js';
import type {
  AddDownloadAssetInput,
  AddEventAssetInput,
  CreateBundleInput,
  CreateCommunityInput,
  CreateCourseInput,
  CreateDownloadInput,
  CreateEventInput,
  CreateSpaceInput,
  ListBundlesQuery,
  ListCommunitiesQuery,
  ListCoursesQuery,
  ListDownloadsQuery,
  ListEventsQuery,
  Page,
  PatchCommunitySettingsInput,
  SetSpaceTopicsInput,
  UpdateBundleInput,
  UpdateCommunityInput,
  UpdateCourseInput,
  UpdateDownloadInput,
  UpdateEventInput,
  UpdateSpaceInput,
} from './types.js';
import { isDeepStrictEqual } from 'node:util';
import { contentEvents } from './events.js';
import { EVENT_LEADS, EVENT_STARTING_SOON_JOB } from './jobs.js';
import type { Actor } from '../shared/actor.js';
import type { AssetFiles, FileUrls, ReadyFile } from '../assets/index.js';
import type { Logger, NewDomainEvent, Scheduler } from '../shared/ports.js';
import {
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
} from '../shared/errors.js';
import { noopLogger } from '../shared/logger.js';
import { spaceSettingsDefaults } from '../types/schemas/content.js';
import type { EventMetadata, Permission } from '../types/index.js';

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
  libraryAssets: ContentAssetReader;
  files: Pick<AssetFiles, 'readyFiles' | 'fileLinks' | 'syncPublicImages'>;
  fileUrls: FileUrls;
  scheduler: Pick<Scheduler, 'at' | 'cancel'>;
  logger?: Logger;
};

function isPublishedActivity(settings: unknown): boolean {
  return (settings as { published?: unknown } | null)?.published !== false;
}

function actorMetadata(actor: Actor): { actorId: string } {
  return { actorId: actor.id };
}

const COMMUNITY_READERS: readonly Permission[] = ['communities:read', 'communities:moderate'];

function eventChange(actor: Actor, previous: Event, next: Event): EventMetadata {
  return {
    actorId: actor.id,
    previousStatus: previous.status,
    previousType: previous.settings.type,
    previousStartsAt: previous.startsAt.toISOString(),
    previousEndsAt: previous.endsAt.toISOString(),
    locationChanged: !isDeepStrictEqual(previous.location, next.location),
  };
}

function assertEventTimes(startsAt: Date, endsAt: Date): void {
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new InvalidInputError('An event must end after it starts');
  }
}

function startingSoonKey(eventId: string, lead: EventLead): string {
  return `${eventId}:${lead}`;
}

const EVENT_LEAD_KEYS = Object.keys(EVENT_LEADS) as EventLead[];

type WithThumbnail = {
  orgId: string;
  id: string;
  type: 'course' | 'download' | 'community' | 'event';
  status: string;
  thumbnailAssetId: string | null;
};

function shownPublicly(item: Pick<WithThumbnail, 'type' | 'status'>): boolean {
  return item.status === 'published' || (item.type === 'event' && item.status === 'canceled');
}

function spaceImageIds(space: Space): string[] {
  return [space.coverAssetId, space.backgroundAssetId, space.iconAssetId].filter(
    (id): id is string => id !== null,
  );
}

function sameIdSet(current: string[], requested: string[]): boolean {
  if (current.length !== requested.length) {
    return false;
  }
  const have = new Set(current);
  return requested.every((id) => have.has(id)) && new Set(requested).size === requested.length;
}

export class ContentService
  implements
    CourseManagementService,
    DownloadablesService,
    BundlesService,
    CommunitiesService,
    EventsService
{
  private readonly repo: ContentRepository;
  private readonly uow: ContentUnitOfWork;
  private readonly libraryAssets: ContentAssetReader;
  private readonly files: Pick<AssetFiles, 'readyFiles' | 'fileLinks' | 'syncPublicImages'>;
  private readonly fileUrls: FileUrls;
  private readonly scheduler: Pick<Scheduler, 'at' | 'cancel'>;
  private readonly logger: Logger;

  constructor(params: ContentServiceParams) {
    this.repo = params.repo;
    this.uow = params.uow;
    this.libraryAssets = params.libraryAssets;
    this.files = params.files;
    this.fileUrls = params.fileUrls;
    this.scheduler = params.scheduler;
    this.logger = params.logger ?? noopLogger;
  }

  private require(actor: Actor, permission: Permission, on?: string): void {
    this.requireAny(actor, [permission], on);
  }

  private requireAny(actor: Actor, permissions: readonly Permission[], on?: string): void {
    if (!permissions.some((permission) => actor.permissions.has(permission, on))) {
      this.logger.warn('content action refused', {
        orgId: actor.orgId,
        actorId: actor.id,
        permission: permissions.join(' or '),
        contentId: on,
      });
      throw new ForbiddenError(`You need ${permissions.join(' or ')}`);
    }
  }

  private visibleIds(
    actor: Actor,
    permissions: readonly Permission[],
    what: string,
  ): string[] | undefined {
    const wheres = permissions.map((permission) => actor.permissions.where(permission));
    if (wheres.some((where) => where.org)) {
      return undefined;
    }
    const ids = [...new Set(wheres.flatMap((where) => where.content))];
    if (ids.length === 0) {
      this.logger.warn('content list refused', {
        orgId: actor.orgId,
        actorId: actor.id,
        permission: permissions.join(' or '),
      });
      throw new ForbiddenError(`You cannot see ${what}`);
    }
    return ids;
  }

  private async withThumbnail<T extends WithThumbnail>(
    item: T,
  ): Promise<T & { thumbnailUrl: string | null }> {
    const [view] = await this.withThumbnails([item]);
    return view!;
  }

  private async withThumbnails<T extends WithThumbnail>(
    items: readonly T[],
  ): Promise<(T & { thumbnailUrl: string | null })[]> {
    const gated = items.flatMap((item) =>
      item.thumbnailAssetId && !shownPublicly(item) ? [{ assetId: item.thumbnailAssetId }] : [],
    );
    const links = gated.length > 0 ? await this.files.fileLinks(items[0]!.orgId, gated) : {};
    return items.map((item) => ({
      ...item,
      thumbnailUrl: !item.thumbnailAssetId
        ? null
        : shownPublicly(item)
          ? this.fileUrls.publicImage(item.orgId, item.id, item.thumbnailAssetId)
          : (links[item.thumbnailAssetId] ?? null),
    }));
  }

  private syncThumbnail(item: WithThumbnail): Promise<void> {
    return this.files.syncPublicImages(
      item.orgId,
      item.id,
      shownPublicly(item) && item.thumbnailAssetId ? [item.thumbnailAssetId] : [],
    );
  }

  private withdrawThumbnail(orgId: string, id: string): Promise<void> {
    return this.files.syncPublicImages(orgId, id, []);
  }

  private async spaceView(space: SpaceDetail, published: boolean): Promise<SpaceView> {
    const [view] = await this.spaceViews([space], published);
    return view!;
  }

  private async spaceViews(
    spaces: readonly SpaceDetail[],
    published: boolean,
  ): Promise<SpaceView[]> {
    const gated = published ? [] : spaces.flatMap((space) => spaceImageIds(space));
    const links =
      gated.length > 0
        ? await this.files.fileLinks(
            spaces[0]!.orgId,
            gated.map((assetId) => ({ assetId })),
          )
        : {};
    return spaces.map((space) => {
      const url = (assetId: string | null) =>
        !assetId
          ? null
          : published
            ? this.fileUrls.publicImage(space.orgId, space.id, assetId)
            : (links[assetId] ?? null);
      return {
        ...space,
        coverUrl: url(space.coverAssetId),
        backgroundUrl: url(space.backgroundAssetId),
        iconUrl: url(space.iconAssetId),
      };
    });
  }

  private async communityPublished(orgId: string, communityId: string): Promise<boolean> {
    return (await this.repo.findCommunityById(orgId, communityId))?.status === 'published';
  }

  private async oneSpaceView(space: SpaceDetail): Promise<SpaceView> {
    return this.spaceView(space, await this.communityPublished(space.orgId, space.communityId));
  }

  private syncSpaceImages(space: Space, published: boolean): Promise<void> {
    return this.files.syncPublicImages(
      space.orgId,
      space.id,
      published ? spaceImageIds(space) : [],
    );
  }

  private async pageWithThumbnails<T extends WithThumbnail>(
    page: Page<T>,
  ): Promise<Page<T & { thumbnailUrl: string | null }>> {
    return { ...page, rows: await this.withThumbnails(page.rows) };
  }

  private downloadFiles(orgId: string, links: DownloadAsset[]): Promise<DownloadFile[]> {
    return this.listedFiles(orgId, links);
  }

  private eventFiles(orgId: string, links: EventAsset[]): Promise<EventFile[]> {
    return this.listedFiles(orgId, links);
  }

  private async listedFiles<T extends { assetId: string; displayName: string | null }>(
    orgId: string,
    links: T[],
  ): Promise<(T & ReadyFile & { url: string })[]> {
    const ready = await this.files.readyFiles(
      orgId,
      links.map((link) => link.assetId),
    );
    const urls = await this.files.fileLinks(
      orgId,
      links.flatMap((link) => {
        const file = ready[link.assetId];
        return file ? [{ assetId: link.assetId, saveAs: link.displayName ?? file.filename }] : [];
      }),
    );
    return links.flatMap((link) => {
      const file = ready[link.assetId];
      const url = urls[link.assetId];
      return file && url ? [{ ...link, ...file, url }] : [];
    });
  }

  private async assertAttachable(
    actor: Actor,
    itemId: string,
    requested: (string | null | undefined)[],
    attached: () => Promise<(string | null)[]>,
    user: string,
  ): Promise<void> {
    const ids = [...new Set(requested.filter((id): id is string => typeof id === 'string'))];
    if (ids.length === 0) {
      return;
    }
    const held = new Set(await attached());
    const added = ids.filter((id) => !held.has(id));
    if (added.length === 0) {
      return;
    }
    const orgId = actor.orgId;
    const found = new Map(
      (await this.libraryAssets.libraryAssetsFor(orgId, added)).map((asset) => [asset.id, asset]),
    );
    const missing = added.filter((id) => !found.has(id));
    if (missing.length > 0) {
      this.logger.warn('library assets refused', { orgId, contentId: itemId, assetIds: missing });
      throw new ConflictError(
        `${user} can only use ready files from the media library. Not available: ${missing.join(', ')}`,
      );
    }
    if (actor.permissions.has('media:read')) {
      return;
    }
    const foreign = added.filter((id) => found.get(id)?.contentId !== itemId);
    if (foreign.length > 0) {
      this.logger.warn('library assets refused — not uploaded for this item', {
        orgId,
        actorId: actor.id,
        contentId: itemId,
        assetIds: foreign,
      });
      throw new ForbiddenError(
        `You need media:read to use files that were not uploaded for this item: ${foreign.join(', ')}`,
      );
    }
  }

  private async courseAssetIds(orgId: string, courseId: string): Promise<(string | null)[]> {
    const [course, links] = await Promise.all([
      this.repo.findCourseById(orgId, courseId),
      this.repo.listActivityAssetsForCourse(orgId, courseId),
    ]);
    return [course?.thumbnailAssetId ?? null, ...links.map((link) => link.assetId)];
  }

  private async downloadAssetIds(orgId: string, downloadId: string): Promise<(string | null)[]> {
    const [download, links] = await Promise.all([
      this.repo.getDownload(orgId, downloadId),
      this.repo.listDownloadAssets(orgId, downloadId),
    ]);
    return [download?.thumbnailAssetId ?? null, ...links.map((link) => link.assetId)];
  }

  private async eventAssetIds(orgId: string, eventId: string): Promise<(string | null)[]> {
    const [event, links] = await Promise.all([
      this.repo.findEventById(orgId, eventId),
      this.repo.listEventAssets(orgId, eventId),
    ]);
    if (!event) {
      throw new NotFoundError('Event', eventId);
    }
    return [event.thumbnailAssetId, ...links.map((link) => link.assetId)];
  }

  async listCourses(query: ListCoursesQuery, actor: Actor): Promise<Page<CourseView>> {
    const ids = this.visibleIds(actor, ['courses:read'], 'courses');
    return this.pageWithThumbnails(await this.repo.listCourses(actor.orgId, query, ids));
  }

  async getCourse(id: string, actor: Actor): Promise<CourseView> {
    const course = await this.findCourse(id, actor);
    if (!course) {
      throw new NotFoundError('Course', id);
    }
    return course;
  }

  async findCourse(id: string, actor: Actor): Promise<CourseView | null> {
    this.require(actor, 'courses:read', id);
    const course = await this.repo.findCourseById(actor.orgId, id);
    return course ? this.withThumbnail(course) : null;
  }

  async createCourse(input: CreateCourseInput, actor: Actor): Promise<CourseView> {
    this.require(actor, 'courses:write');
    const orgId = actor.orgId;
    const course = await this.uow.run(async ({ content, outbox }) => {
      const created = await content.createCourse(orgId, input, slugify(input.title));
      await outbox.append([contentEvents.courseCreated.make({ orgId, data: created })]);
      return created;
    });
    this.logger.info('course created', {
      orgId,
      courseId: course.id,
      title: course.title,
      actorId: actor.id,
    });
    return this.withThumbnail(course);
  }

  async updateCourse(id: string, patch: UpdateCourseInput, actor: Actor): Promise<CourseView> {
    this.require(actor, 'courses:write', id);
    const orgId = actor.orgId;
    await this.assertAttachable(
      actor,
      id,
      [patch.thumbnailAssetId],
      () => this.courseAssetIds(orgId, id),
      'A course',
    );
    const course = await this.uow.run(async ({ content, outbox }) => {
      const updated = await content.updateCourse(orgId, id, patch);
      if (!updated) {
        this.logger.warn('course update rejected — not found', { orgId, courseId: id });
        throw new NotFoundError('Course', id);
      }
      await outbox.append([contentEvents.courseUpdated.make({ orgId, data: updated })]);
      return updated;
    });
    this.logger.info('course updated', {
      orgId,
      courseId: id,
      fields: Object.keys(patch),
      actorId: actor.id,
    });
    await this.syncThumbnail(course);
    return this.withThumbnail(course);
  }

  async patchCourseSettings(
    id: string,
    value: Partial<CourseSettings>,
    actor: Actor,
  ): Promise<CourseSettings> {
    this.require(actor, 'courses:write', id);
    const orgId = actor.orgId;
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
    this.logger.info('course settings patched', { orgId, courseId: id, value, actorId: actor.id });
    return merged;
  }

  async deleteCourse(id: string, actor: Actor): Promise<void> {
    this.require(actor, 'courses:delete', id);
    const orgId = actor.orgId;
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
    this.logger.info('course deleted', { orgId, courseId: id, actorId: actor.id });
    await this.withdrawThumbnail(orgId, id);
  }

  // --- modules & activities ------------------------------------------------

  async listCourseModules(courseId: string, actor: Actor): Promise<Module[]> {
    this.require(actor, 'courses:read', courseId);
    return this.repo.listCourseModules(actor.orgId, courseId);
  }
  async listCourseActivities(courseId: string, actor: Actor): Promise<Activity[]> {
    this.require(actor, 'courses:read', courseId);
    return this.repo.listActivitiesForCourse(actor.orgId, courseId);
  }
  async listCourseActivityViews(courseId: string, actor: Actor): Promise<ActivityView[]> {
    this.require(actor, 'courses:read', courseId);
    const [activities, links] = await Promise.all([
      this.repo.listActivitiesForCourse(actor.orgId, courseId),
      this.repo.listActivityAssetsForCourse(actor.orgId, courseId),
    ]);
    const urls = await this.files.fileLinks(
      actor.orgId,
      links.map((link) => ({ assetId: link.assetId })),
    );
    return activities.map((activity) => ({
      ...activity,
      assetUrls: Object.fromEntries(
        links.flatMap((link) => {
          const url = urls[link.assetId];
          return link.activityId === activity.id && url ? [[link.assetId, url]] : [];
        }),
      ),
    }));
  }
  async listCourseActivityAssets(courseId: string, actor: Actor): Promise<ActivityAsset[]> {
    this.require(actor, 'courses:read', courseId);
    return this.repo.listActivityAssetsForCourse(actor.orgId, courseId);
  }
  async getActivity(activityId: string, actor: Actor): Promise<Activity | null> {
    const activity = await this.repo.findActivity(actor.orgId, activityId);
    if (activity) {
      this.require(actor, 'courses:read', activity.courseId);
    }
    return activity;
  }
  async getModule(moduleId: string, actor: Actor): Promise<Module | null> {
    const module = await this.repo.findModule(actor.orgId, moduleId);
    if (module) {
      this.require(actor, 'courses:read', module.courseId);
    }
    return module;
  }

  async reorderModules(courseId: string, orderedIds: string[], actor: Actor): Promise<Module[]> {
    this.require(actor, 'courses:write', courseId);
    const orgId = actor.orgId;
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

  async createModule(courseId: string, title: string, actor: Actor): Promise<Module[]> {
    this.require(actor, 'courses:write', courseId);
    const orgId = actor.orgId;
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
    this.logger.info('module created', {
      orgId,
      courseId,
      moduleId: created.id,
      title,
      actorId: actor.id,
    });
    return modules;
  }

  async updateModule(
    courseId: string,
    moduleId: string,
    title: string,
    actor: Actor,
  ): Promise<Module[]> {
    this.require(actor, 'courses:write', courseId);
    const orgId = actor.orgId;
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
    this.logger.info('module updated', { orgId, courseId, moduleId, title, actorId: actor.id });
    return modules;
  }

  async deleteModule(courseId: string, moduleId: string, actor: Actor): Promise<Module[]> {
    this.require(actor, 'courses:write', courseId);
    const orgId = actor.orgId;
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
    this.logger.info('module deleted', { orgId, courseId, moduleId, actorId: actor.id });
    return modules;
  }

  async reorderActivities(
    courseId: string,
    moduleId: string,
    orderedIds: string[],
    actor: Actor,
  ): Promise<Module[]> {
    this.require(actor, 'courses:write', courseId);
    const orgId = actor.orgId;
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

  async saveActivity(
    courseId: string,
    moduleId: string,
    input: SaveActivityInput,
    activityId: string | null,
    actor: Actor,
  ): Promise<Module[]> {
    this.require(actor, 'courses:write', courseId);
    const orgId = actor.orgId;
    await this.assertAttachable(
      actor,
      courseId,
      input.assetIds ?? [],
      () => this.courseAssetIds(orgId, courseId),
      'An activity',
    );
    const { modules, activity } = await this.uow.run(async ({ content, outbox }) => {
      let wasPublished = false;
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
        wasPublished = isPublishedActivity(existing.settings);
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
        activityId ?? undefined,
      );
      const events: NewDomainEvent[] = [
        activityId
          ? contentEvents.activityUpdated.make({ orgId, data: saved })
          : contentEvents.activityCreated.make({ orgId, data: saved }),
      ];
      if (!wasPublished && isPublishedActivity(saved.settings)) {
        const course = await content.findCourseById(orgId, courseId);
        if (course?.status === 'published') {
          events.push(
            contentEvents.activityPublished.make({
              orgId,
              data: { activityId: saved.id, moduleId, courseId },
            }),
          );
        }
      }
      await outbox.append(events);
      return { modules: all, activity: saved };
    });
    this.logger.info(activityId ? 'activity updated' : 'activity created', {
      orgId,
      courseId,
      moduleId,
      activityId: activity.id,
      actorId: actor.id,
    });
    return modules;
  }

  async deleteActivity(
    courseId: string,
    moduleId: string,
    activityId: string,
    actor: Actor,
  ): Promise<Module[]> {
    this.require(actor, 'courses:write', courseId);
    const orgId = actor.orgId;
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
    this.logger.info('activity deleted', {
      orgId,
      courseId,
      moduleId,
      activityId,
      actorId: actor.id,
    });
    return modules;
  }

  // --- downloads ------------------------------------------------------------

  async listDownloads(query: ListDownloadsQuery, actor: Actor): Promise<Page<DownloadView>> {
    const ids = this.visibleIds(actor, ['downloads:read'], 'downloads');
    return this.pageWithThumbnails(await this.repo.listDownloads(actor.orgId, query, ids));
  }

  async getDownload(id: string, actor: Actor): Promise<DownloadView> {
    const download = await this.findDownload(id, actor);
    if (!download) {
      throw new NotFoundError('Download', id);
    }
    return download;
  }

  async findDownload(id: string, actor: Actor): Promise<DownloadView | null> {
    this.require(actor, 'downloads:read', id);
    const download = await this.repo.getDownload(actor.orgId, id);
    return download ? this.withThumbnail(download) : null;
  }

  async createDownload(input: CreateDownloadInput, actor: Actor): Promise<DownloadView> {
    this.require(actor, 'downloads:write');
    const orgId = actor.orgId;
    const download = await this.uow.run(async ({ content, outbox }) => {
      const created = await content.createDownload(orgId, input, slugify(input.title));
      await outbox.append([contentEvents.downloadCreated.make({ orgId, data: created })]);
      return created;
    });
    this.logger.info('download created', {
      orgId,
      downloadId: download.id,
      title: download.title,
      actorId: actor.id,
    });
    return this.withThumbnail(download);
  }

  async updateDownload(
    id: string,
    patch: UpdateDownloadInput,
    actor: Actor,
  ): Promise<DownloadView> {
    this.require(actor, 'downloads:write', id);
    const orgId = actor.orgId;
    await this.assertAttachable(
      actor,
      id,
      [patch.thumbnailAssetId],
      () => this.downloadAssetIds(orgId, id),
      'A download',
    );
    const download = await this.uow.run(async ({ content, outbox }) => {
      const updated = await content.updateDownload(orgId, id, patch);
      if (!updated) {
        this.logger.warn('download update rejected — not found', { orgId, downloadId: id });
        throw new NotFoundError('Download', id);
      }
      await outbox.append([contentEvents.downloadUpdated.make({ orgId, data: updated })]);
      return updated;
    });
    this.logger.info('download updated', {
      orgId,
      downloadId: id,
      fields: Object.keys(patch),
      actorId: actor.id,
    });
    await this.syncThumbnail(download);
    return this.withThumbnail(download);
  }

  async removeDownload(id: string, actor: Actor): Promise<void> {
    this.require(actor, 'downloads:delete', id);
    const orgId = actor.orgId;
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
    this.logger.info('download deleted', { orgId, downloadId: id, actorId: actor.id });
    await this.withdrawThumbnail(orgId, id);
  }

  // --- download asset links ------------------------------------------------

  async listDownloadAssets(downloadId: string, actor: Actor): Promise<DownloadFile[]> {
    this.require(actor, 'downloads:read', downloadId);
    return this.downloadFiles(
      actor.orgId,
      await this.repo.listDownloadAssets(actor.orgId, downloadId),
    );
  }

  async addDownloadAsset(
    downloadId: string,
    input: AddDownloadAssetInput,
    actor: Actor,
  ): Promise<DownloadFile[]> {
    this.require(actor, 'downloads:write', downloadId);
    const orgId = actor.orgId;
    await this.assertAttachable(
      actor,
      downloadId,
      [input.assetId],
      () => this.downloadAssetIds(orgId, downloadId),
      'A download',
    );
    const assets = await this.uow.run(async ({ content, outbox }) => {
      const assets = await content.addDownloadAsset(orgId, downloadId, input);
      await outbox.append([
        contentEvents.downloadAssetAdded.make({ orgId, data: { downloadId, assets } }),
      ]);
      return assets;
    });
    this.logger.info('download asset added', {
      orgId,
      downloadId,
      assetId: input.assetId,
      actorId: actor.id,
    });
    return this.downloadFiles(orgId, assets);
  }

  async removeDownloadAsset(
    downloadId: string,
    assetId: string,
    actor: Actor,
  ): Promise<DownloadFile[]> {
    this.require(actor, 'downloads:write', downloadId);
    const orgId = actor.orgId;
    const assets = await this.uow.run(async ({ content, outbox }) => {
      const assets = await content.removeDownloadAsset(orgId, downloadId, assetId);
      await outbox.append([
        contentEvents.downloadAssetRemoved.make({ orgId, data: { downloadId, assets } }),
      ]);
      return assets;
    });
    this.logger.info('download asset removed', { orgId, downloadId, assetId, actorId: actor.id });
    return this.downloadFiles(orgId, assets);
  }

  async renameDownloadAsset(
    downloadId: string,
    assetId: string,
    displayName: string | null,
    actor: Actor,
  ): Promise<DownloadFile[]> {
    this.require(actor, 'downloads:write', downloadId);
    const orgId = actor.orgId;
    const assets = await this.uow.run(async ({ content, outbox }) => {
      const assets = await content.renameDownloadAsset(orgId, downloadId, assetId, displayName);
      await outbox.append([
        contentEvents.downloadAssetRenamed.make({ orgId, data: { downloadId, assets } }),
      ]);
      return assets;
    });
    this.logger.info('download asset renamed', { orgId, downloadId, assetId, actorId: actor.id });
    return this.downloadFiles(orgId, assets);
  }

  /** The caller must send the COMPLETE ordered set — a partial list would
   *  silently unlink whatever it omitted. */
  async reorderDownloadAssets(
    downloadId: string,
    assetIds: string[],
    actor: Actor,
  ): Promise<DownloadFile[]> {
    this.require(actor, 'downloads:write', downloadId);
    const orgId = actor.orgId;
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

  async listEvents(query: ListEventsQuery, actor: Actor): Promise<Page<EventView>> {
    const ids = this.visibleIds(actor, ['events:read'], 'events');
    return this.pageWithThumbnails(await this.repo.listEvents(actor.orgId, query, ids));
  }

  async getEvent(id: string, actor: Actor): Promise<EventView> {
    const event = await this.findEvent(id, actor);
    if (!event) {
      throw new NotFoundError('Event', id);
    }
    return event;
  }

  async findEvent(id: string, actor: Actor): Promise<EventView | null> {
    this.require(actor, 'events:read', id);
    const event = await this.repo.findEventById(actor.orgId, id);
    return event ? this.withThumbnail(event) : null;
  }

  async findEvents(ids: string[], actor: Actor): Promise<EventView[]> {
    for (const id of ids) {
      this.require(actor, 'events:read', id);
    }
    if (ids.length === 0) {
      return [];
    }
    const found = await this.repo.findEventsByIds(actor.orgId, ids);
    return this.withThumbnails(found);
  }

  async createEvent(input: CreateEventInput, actor: Actor): Promise<EventView> {
    this.require(actor, 'events:write');
    assertEventTimes(input.startsAt, input.endsAt);
    const orgId = actor.orgId;
    const { settings, ...fields } = input;
    const event = await this.uow.run(async ({ content, outbox }) => {
      const created = await content.createEvent(orgId, fields);
      const event = settings
        ? { ...created, settings: await content.patchEventSettings(orgId, created.id, settings) }
        : created;
      await outbox.append([
        contentEvents.eventCreated.make({ orgId, data: event, metadata: actorMetadata(actor) }),
      ]);
      return event;
    });
    this.logger.info('event created', {
      orgId,
      eventId: event.id,
      title: event.title,
      actorId: actor.id,
    });
    return this.withThumbnail(event);
  }

  async updateEvent(id: string, patch: UpdateEventInput, actor: Actor): Promise<EventView> {
    this.require(actor, 'events:write', id);
    const orgId = actor.orgId;
    await this.assertAttachable(
      actor,
      id,
      [patch.thumbnailAssetId],
      () => this.eventAssetIds(orgId, id),
      'An event',
    );
    const { settings, ...fields } = patch;
    const { previous, event } = await this.uow.run(async ({ content, outbox }) => {
      const previous = await content.findEventById(orgId, id);
      if (!previous) {
        this.logger.warn('event update rejected — not found', { orgId, eventId: id });
        throw new NotFoundError('Event', id);
      }
      if (previous.status === 'canceled') {
        this.logger.warn('event update rejected — canceled', { orgId, eventId: id });
        throw new ConflictError('The event is canceled', 'canceled');
      }
      assertEventTimes(fields.startsAt ?? previous.startsAt, fields.endsAt ?? previous.endsAt);
      const updated = await content.updateEvent(orgId, id, fields);
      if (!updated) {
        throw new NotFoundError('Event', id);
      }
      const event: Event = settings
        ? { ...updated, settings: await content.patchEventSettings(orgId, id, settings) }
        : updated;
      await outbox.append([
        contentEvents.eventUpdated.make({
          orgId,
          data: event,
          metadata: eventChange(actor, previous, event),
        }),
      ]);
      return { previous, event };
    });
    this.logger.info('event updated', {
      orgId,
      eventId: id,
      fields: Object.keys(patch),
      actorId: actor.id,
    });
    await this.scheduleStartingSoon(orgId, previous, event);
    await this.syncThumbnail(event);
    return this.withThumbnail(event);
  }

  async cancelEvent(id: string, actor: Actor): Promise<EventView> {
    this.require(actor, 'events:write', id);
    const orgId = actor.orgId;
    const event = await this.uow.run(async ({ content, outbox }) => {
      const previous = await content.findEventById(orgId, id);
      if (!previous) {
        this.logger.warn('event cancel rejected — not found', { orgId, eventId: id });
        throw new NotFoundError('Event', id);
      }
      if (previous.status === 'canceled') {
        this.logger.warn('event cancel rejected — already canceled', { orgId, eventId: id });
        throw new ConflictError('The event is already canceled', 'canceled');
      }
      const updated = await content.updateEvent(orgId, id, { status: 'canceled' });
      if (!updated) {
        throw new NotFoundError('Event', id);
      }
      await outbox.append([
        contentEvents.eventUpdated.make({
          orgId,
          data: updated,
          metadata: eventChange(actor, previous, updated),
        }),
      ]);
      return updated;
    });
    this.logger.info('event canceled', { orgId, eventId: id, actorId: actor.id });
    await this.cancelStartingSoon(orgId, id);
    await this.syncThumbnail(event);
    return this.withThumbnail(event);
  }

  async deleteEvent(id: string, actor: Actor): Promise<void> {
    this.require(actor, 'events:delete', id);
    const orgId = actor.orgId;
    await this.uow.run(async ({ content, outbox }) => {
      const event = await content.findEventById(orgId, id);
      if (!event) {
        this.logger.warn('event delete rejected — not found', { orgId, eventId: id });
        throw new NotFoundError('Event', id);
      }
      const linked = await content.spacesLinkingContent(orgId, id);
      const ok = await content.deleteEvent(orgId, id);
      if (!ok) {
        throw new NotFoundError('Event', id);
      }
      await content.deleteEventSettings(orgId, id);
      await outbox.append([
        contentEvents.eventDeleted.make({ orgId, data: event, metadata: actorMetadata(actor) }),
        ...(await this.spaceUpdates(content, orgId, linked, actor)),
      ]);
    });
    this.logger.info('event deleted', { orgId, eventId: id, actorId: actor.id });
    await this.withdrawThumbnail(orgId, id);
    await this.cancelStartingSoon(orgId, id);
  }

  async startingSoon(orgId: string, eventId: string, lead: EventLead, now: Date): Promise<void> {
    const event = await this.repo.findEventById(orgId, eventId);
    if (!event || event.status !== 'published') {
      this.logger.debug('event no longer published', { orgId, eventId, lead });
      return;
    }
    const due = new Date(event.startsAt.getTime() - EVENT_LEADS[lead]);
    if (due > now) {
      await this.scheduler.at(EVENT_STARTING_SOON_JOB, due, startingSoonKey(eventId, lead), {
        orgId,
        eventId,
        lead,
      });
      this.logger.info('event starting soon timer moved', {
        orgId,
        eventId,
        lead,
        due: due.toISOString(),
      });
      return;
    }
    await this.uow.run(({ outbox }) =>
      outbox.append([
        contentEvents.eventStartingSoon.make({
          orgId,
          data: { eventId, lead, startsAt: event.startsAt },
        }),
      ]),
    );
    this.logger.info('event starting soon', { orgId, eventId, lead });
  }

  private async scheduleStartingSoon(orgId: string, previous: Event, event: Event): Promise<void> {
    if (event.status !== 'published') {
      if (previous.status === 'published') {
        await this.cancelStartingSoon(orgId, event.id);
      }
      return;
    }
    if (
      previous.status === 'published' &&
      previous.startsAt.getTime() === event.startsAt.getTime()
    ) {
      return;
    }
    const now = Date.now();
    for (const lead of EVENT_LEAD_KEYS) {
      const key = startingSoonKey(event.id, lead);
      const runAt = new Date(event.startsAt.getTime() - EVENT_LEADS[lead]);
      try {
        if (runAt.getTime() > now) {
          await this.scheduler.at(EVENT_STARTING_SOON_JOB, runAt, key, {
            orgId,
            eventId: event.id,
            lead,
          });
        } else {
          await this.scheduler.cancel(EVENT_STARTING_SOON_JOB, key);
        }
      } catch (err) {
        this.logger.error('event starting soon timer not set', {
          orgId,
          eventId: event.id,
          lead,
          err,
        });
      }
    }
  }

  private async cancelStartingSoon(orgId: string, eventId: string): Promise<void> {
    for (const lead of EVENT_LEAD_KEYS) {
      try {
        await this.scheduler.cancel(EVENT_STARTING_SOON_JOB, startingSoonKey(eventId, lead));
      } catch (err) {
        this.logger.warn('event starting soon timer not cancelled', { orgId, eventId, lead, err });
      }
    }
  }

  async listEventAssets(eventId: string, actor: Actor): Promise<EventFile[]> {
    this.require(actor, 'events:read', eventId);
    const orgId = actor.orgId;
    if (!(await this.repo.findEventById(orgId, eventId))) {
      throw new NotFoundError('Event', eventId);
    }
    return this.eventFiles(orgId, await this.repo.listEventAssets(orgId, eventId));
  }

  async eventFilesFor(eventIds: string[], actor: Actor): Promise<Record<string, EventFile[]>> {
    for (const id of eventIds) {
      this.require(actor, 'events:read', id);
    }
    const byEvent: Record<string, EventFile[]> = Object.fromEntries(eventIds.map((id) => [id, []]));
    if (eventIds.length === 0) {
      return byEvent;
    }
    const files = await this.eventFiles(
      actor.orgId,
      await this.repo.listEventAssetsFor(actor.orgId, eventIds),
    );
    for (const file of files) {
      byEvent[file.eventId]?.push(file);
    }
    return byEvent;
  }

  async addEventAsset(
    eventId: string,
    input: AddEventAssetInput,
    actor: Actor,
  ): Promise<EventFile[]> {
    this.require(actor, 'events:write', eventId);
    const orgId = actor.orgId;
    await this.assertAttachable(
      actor,
      eventId,
      [input.assetId],
      () => this.eventAssetIds(orgId, eventId),
      'An event',
    );
    const assets = await this.uow.run(({ content }) =>
      content.addEventAsset(orgId, eventId, input),
    );
    this.logger.info('event asset added', {
      orgId,
      eventId,
      assetId: input.assetId,
      actorId: actor.id,
    });
    return this.eventFiles(orgId, assets);
  }

  async removeEventAsset(eventId: string, assetId: string, actor: Actor): Promise<EventFile[]> {
    this.require(actor, 'events:write', eventId);
    const orgId = actor.orgId;
    const assets = await this.uow.run(({ content }) =>
      content.removeEventAsset(orgId, eventId, assetId),
    );
    this.logger.info('event asset removed', { orgId, eventId, assetId, actorId: actor.id });
    return this.eventFiles(orgId, assets);
  }

  async renameEventAsset(
    eventId: string,
    assetId: string,
    displayName: string | null,
    actor: Actor,
  ): Promise<EventFile[]> {
    this.require(actor, 'events:write', eventId);
    const orgId = actor.orgId;
    const assets = await this.uow.run(({ content }) =>
      content.renameEventAsset(orgId, eventId, assetId, displayName),
    );
    this.logger.info('event asset renamed', { orgId, eventId, assetId, actorId: actor.id });
    return this.eventFiles(orgId, assets);
  }

  async reorderEventAssets(
    eventId: string,
    assetIds: string[],
    actor: Actor,
  ): Promise<EventFile[]> {
    this.require(actor, 'events:write', eventId);
    const orgId = actor.orgId;
    const assets = await this.uow.run(async ({ content }) => {
      const current = await content.listEventAssets(orgId, eventId);
      if (
        !sameIdSet(
          current.map((link) => link.assetId),
          assetIds,
        )
      ) {
        this.logger.warn('event asset reorder rejected — id set mismatch', {
          orgId,
          eventId,
          assetIds,
        });
        throw new ConflictError("Ordered asset ids does not match the event's current assets");
      }
      return content.reorderEventAssets(orgId, eventId, assetIds);
    });
    this.logger.debug('event assets reordered', { orgId, eventId });
    return this.eventFiles(orgId, assets);
  }

  // --- bundles --------------------------------------------------------------

  async listBundles(query: ListBundlesQuery, actor: Actor): Promise<Page<Bundle>> {
    this.require(actor, 'bundles:read');
    return this.repo.listBundles(actor.orgId, query);
  }

  async getBundle(id: string, actor: Actor): Promise<Bundle> {
    const bundle = await this.findBundle(id, actor);
    if (!bundle) {
      throw new NotFoundError('Bundle', id);
    }
    return bundle;
  }

  async findBundle(id: string, actor: Actor): Promise<Bundle | null> {
    this.require(actor, 'bundles:read');
    return this.repo.findBundleById(actor.orgId, id);
  }

  async createBundle(input: CreateBundleInput, actor: Actor): Promise<Bundle> {
    this.require(actor, 'bundles:write');
    const orgId = actor.orgId;
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
      actorId: actor.id,
    });
    return bundle;
  }

  async updateBundle(id: string, patch: UpdateBundleInput, actor: Actor): Promise<Bundle> {
    this.require(actor, 'bundles:write');
    const orgId = actor.orgId;
    const bundle = await this.uow.run(async ({ content, outbox }) => {
      const updated = await content.updateBundle(orgId, id, patch);
      if (!updated) {
        this.logger.warn('bundle update rejected — not found', { orgId, bundleId: id });
        throw new NotFoundError('Bundle', id);
      }
      await outbox.append([contentEvents.bundleUpdated.make({ orgId, data: updated })]);
      return updated;
    });
    this.logger.info('bundle updated', {
      orgId,
      bundleId: id,
      fields: Object.keys(patch),
      actorId: actor.id,
    });
    return bundle;
  }

  async deleteBundle(id: string, actor: Actor): Promise<void> {
    this.require(actor, 'bundles:delete');
    const orgId = actor.orgId;
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
    this.logger.info('bundle deleted', { orgId, bundleId: id, actorId: actor.id });
  }

  async listBundleItems(bundleId: string, actor: Actor): Promise<BundleItem[]> {
    this.require(actor, 'bundles:read');
    return this.repo.listBundleItems(actor.orgId, bundleId);
  }

  async addBundleItem(bundleId: string, contentId: string, actor: Actor): Promise<BundleItem[]> {
    this.require(actor, 'bundles:write');
    const orgId = actor.orgId;
    const items = await this.uow.run(async ({ content, outbox }) => {
      const all = await content.addBundleItem(orgId, bundleId, contentId);
      await outbox.append([
        contentEvents.bundleItemAdded.make({ orgId, data: { bundleId, items: all } }),
      ]);
      return all;
    });
    this.logger.info('bundle item added', { orgId, bundleId, contentId, actorId: actor.id });
    return items;
  }

  async removeBundleItem(bundleId: string, contentId: string, actor: Actor): Promise<BundleItem[]> {
    this.require(actor, 'bundles:write');
    const orgId = actor.orgId;
    const items = await this.uow.run(async ({ content, outbox }) => {
      const all = await content.removeBundleItem(orgId, bundleId, contentId);
      await outbox.append([
        contentEvents.bundleItemRemoved.make({ orgId, data: { bundleId, items: all } }),
      ]);
      return all;
    });
    this.logger.info('bundle item removed', { orgId, bundleId, contentId, actorId: actor.id });
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
        throw new InvalidInputError('An all-members space has no capacity');
      }
      capacity = null;
    }
    const settings = {
      ...(current?.settings ?? spaceSettingsDefaults),
      ...input.settings,
    };
    return { accessRule, capacity, settings };
  }

  async listCommunities(query: ListCommunitiesQuery, actor: Actor): Promise<Page<CommunityView>> {
    const ids = this.visibleIds(actor, COMMUNITY_READERS, 'communities');
    return this.pageWithThumbnails(await this.repo.listCommunities(actor.orgId, query, ids));
  }

  async getCommunity(id: string, actor: Actor): Promise<CommunityView> {
    const community = await this.findCommunity(id, actor);
    if (!community) {
      throw new NotFoundError('Community', id);
    }
    return community;
  }

  async findCommunity(id: string, actor: Actor): Promise<CommunityView | null> {
    this.requireAny(actor, COMMUNITY_READERS, id);
    const community = await this.repo.findCommunityById(actor.orgId, id);
    return community ? this.withThumbnail(community) : null;
  }

  communitiesWithDigest(): Promise<CommunityDigest[]> {
    return this.repo.communitiesWithDigest();
  }

  async listCommunitiesById(ids: string[], actor: Actor): Promise<Community[]> {
    if (!actor.permissions.anywhere('communities:read')) {
      this.logger.warn('content list refused', {
        orgId: actor.orgId,
        actorId: actor.id,
        permission: 'communities:read',
      });
      throw new ForbiddenError('You cannot see communities');
    }
    const visible = ids.filter((id) => actor.permissions.has('communities:read', id));
    return visible.length ? this.repo.findCommunitiesByIds(actor.orgId, visible) : [];
  }

  async getSpace(spaceId: string, actor: Actor): Promise<SpaceView | null> {
    const space = await this.repo.findSpace(actor.orgId, spaceId);
    if (!space) {
      return null;
    }
    this.require(actor, 'communities:read', space.communityId);
    return this.oneSpaceView(space);
  }

  async getCommunitySpace(communityId: string, spaceId: string, actor: Actor): Promise<SpaceView> {
    this.require(actor, 'communities:read', communityId);
    const space = await this.repo.findSpace(actor.orgId, spaceId);
    if (space?.communityId !== communityId) {
      throw new NotFoundError('Space', spaceId);
    }
    return this.oneSpaceView(space);
  }

  async listSpaces(communityId: string, actor: Actor): Promise<SpaceView[]> {
    this.requireAny(actor, COMMUNITY_READERS, communityId);
    const community = await this.repo.findCommunityById(actor.orgId, communityId);
    if (!community) {
      throw new NotFoundError('Community', communityId);
    }
    const spaces = await this.repo.listSpaces(actor.orgId, communityId);
    return this.spaceViews(spaces, community.status === 'published');
  }

  async getDmSettings(communityId: string, actor: Actor): Promise<DmSettings | null> {
    this.require(actor, 'communities:read', communityId);
    const community = await this.repo.findCommunityById(actor.orgId, communityId);
    return community?.settings.dm ?? null;
  }

  async createCommunity(input: CreateCommunityInput, actor: Actor): Promise<CommunityView> {
    this.require(actor, 'communities:write');
    const orgId = actor.orgId;
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
    this.logger.info('community created', {
      orgId,
      communityId: community.id,
      actorId: actor.id,
    });
    return this.withThumbnail(community);
  }

  async updateCommunity(
    id: string,
    patch: UpdateCommunityInput,
    actor: Actor,
  ): Promise<CommunityView> {
    this.require(actor, 'communities:write', id);
    const orgId = actor.orgId;
    await this.assertAttachable(
      actor,
      id,
      [patch.thumbnailAssetId],
      async () => [(await this.repo.findCommunityById(orgId, id))?.thumbnailAssetId ?? null],
      'A community',
    );
    const community = await this.uow.run(async ({ content, outbox }) => {
      const updated = await content.updateCommunity(orgId, id, patch);
      if (!updated) {
        this.logger.warn('community update rejected — not found', {
          orgId,
          communityId: id,
          actorId: actor.id,
        });
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
    this.logger.info('community updated', { orgId, communityId: id, actorId: actor.id });
    await this.syncThumbnail(community);
    if (patch.status !== undefined) {
      const spaces = await this.repo.listSpaces(orgId, id);
      await Promise.all(
        spaces.map((space) => this.syncSpaceImages(space, community.status === 'published')),
      );
    }
    return this.withThumbnail(community);
  }

  publishCommunity(id: string, actor: Actor): Promise<CommunityView> {
    return this.updateCommunity(id, { status: 'published' }, actor);
  }

  unpublishCommunity(id: string, actor: Actor): Promise<CommunityView> {
    return this.updateCommunity(id, { status: 'draft' }, actor);
  }

  async deleteCommunity(id: string, actor: Actor): Promise<void> {
    this.require(actor, 'communities:delete', id);
    const orgId = actor.orgId;
    const spaceIds = await this.uow.run(async ({ content, outbox }) => {
      const community = await content.findCommunityById(orgId, id);
      if (!community) {
        this.logger.warn('community delete rejected — not found', {
          orgId,
          communityId: id,
          actorId: actor.id,
        });
        throw new NotFoundError('Community', id);
      }
      const linked = await content.spacesLinkingContent(orgId, id);
      const own = await content.listSpaces(orgId, id);
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
      return own.map((space) => space.id);
    });
    this.logger.info('community deleted', { orgId, communityId: id, actorId: actor.id });
    await this.withdrawThumbnail(orgId, id);
    await Promise.all(spaceIds.map((spaceId) => this.files.syncPublicImages(orgId, spaceId, [])));
  }

  async patchCommunitySettings(
    id: string,
    patch: PatchCommunitySettingsInput,
    actor: Actor,
  ): Promise<CommunityView> {
    this.require(actor, 'communities:write', id);
    const orgId = actor.orgId;
    const community = await this.uow.run(async ({ content, outbox }) => {
      const updated = await content.patchCommunitySettings(orgId, id, patch);
      if (!updated) {
        this.logger.warn('community settings patch rejected — not found', {
          orgId,
          communityId: id,
          actorId: actor.id,
        });
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
    this.logger.info('community settings patched', {
      orgId,
      communityId: id,
      actorId: actor.id,
    });
    return this.withThumbnail(community);
  }

  async createSpace(
    communityId: string,
    input: CreateSpaceInput,
    actor: Actor,
  ): Promise<SpaceView> {
    this.require(actor, 'communities:write', communityId);
    const orgId = actor.orgId;
    const resolved = this.resolvedSpace(input);
    const space = await this.uow.run(async ({ content, outbox }) => {
      const community = await content.findCommunityById(orgId, communityId);
      if (!community) {
        this.logger.warn('space create rejected — community not found', {
          orgId,
          communityId,
          actorId: actor.id,
        });
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
    this.logger.info('space created', {
      orgId,
      communityId,
      spaceId: space.id,
      actorId: actor.id,
    });
    return this.oneSpaceView(space);
  }

  async updateSpace(
    communityId: string,
    spaceId: string,
    patch: UpdateSpaceInput,
    actor: Actor,
  ): Promise<SpaceView> {
    this.require(actor, 'communities:write', communityId);
    const orgId = actor.orgId;
    await this.assertAttachable(
      actor,
      communityId,
      [patch.coverAssetId, patch.backgroundAssetId, patch.iconAssetId],
      async () => {
        const current = await this.repo.findSpace(orgId, spaceId);
        return current ? spaceImageIds(current) : [];
      },
      'A space',
    );
    const space = await this.uow.run(async ({ content, outbox }) => {
      const current = await content.findSpace(orgId, spaceId);
      if (!current || current.communityId !== communityId) {
        this.logger.warn('space update rejected — not found', {
          orgId,
          communityId,
          spaceId,
          actorId: actor.id,
        });
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
    this.logger.info('space updated', { orgId, communityId, spaceId, actorId: actor.id });
    const published = await this.communityPublished(orgId, communityId);
    await this.syncSpaceImages(space, published);
    return this.spaceView(space, published);
  }

  async deleteSpace(communityId: string, spaceId: string, actor: Actor): Promise<void> {
    this.require(actor, 'communities:write', communityId);
    const orgId = actor.orgId;
    await this.uow.run(async ({ content, outbox }) => {
      const space = await content.findSpace(orgId, spaceId);
      if (!space || space.communityId !== communityId) {
        this.logger.warn('space delete rejected — not found', {
          orgId,
          communityId,
          spaceId,
          actorId: actor.id,
        });
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
    this.logger.info('space deleted', { orgId, communityId, spaceId, actorId: actor.id });
    await this.files.syncPublicImages(orgId, spaceId, []);
  }

  async reorderSpaces(
    communityId: string,
    orderedIds: string[],
    actor: Actor,
  ): Promise<SpaceView[]> {
    this.require(actor, 'communities:write', communityId);
    const orgId = actor.orgId;
    const spaces = await this.uow.run(async ({ content, outbox }) => {
      const community = await content.findCommunityById(orgId, communityId);
      if (!community) {
        this.logger.warn('spaces reorder rejected — community not found', {
          orgId,
          communityId,
          actorId: actor.id,
        });
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
    this.logger.info('spaces reordered', { orgId, communityId, actorId: actor.id });
    const published = await this.communityPublished(orgId, communityId);
    return this.spaceViews(spaces, published);
  }

  async setSpaceTopics(
    communityId: string,
    spaceId: string,
    input: SetSpaceTopicsInput,
    actor: Actor,
  ): Promise<SpaceView> {
    this.require(actor, 'communities:write', communityId);
    const orgId = actor.orgId;
    const names = input.topics.map((topic) => topic.name);
    if (new Set(names).size !== names.length) {
      throw new InvalidInputError('A space topic name is already used');
    }
    const space = await this.uow.run(async ({ content, outbox }) => {
      const locked = await content.lockSpace(orgId, spaceId);
      if (!locked || locked.communityId !== communityId) {
        this.logger.warn('space topics rejected — space not found', {
          orgId,
          communityId,
          spaceId,
          actorId: actor.id,
        });
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
    this.logger.info('space topics set', { orgId, communityId, spaceId, actorId: actor.id });
    return this.oneSpaceView(space);
  }

  async addSpaceLink(
    communityId: string,
    spaceId: string,
    contentId: string,
    actor: Actor,
  ): Promise<SpaceView> {
    this.require(actor, 'communities:write', communityId);
    const orgId = actor.orgId;
    const space = await this.uow.run(async ({ content, outbox }) => {
      const current = await content.findSpace(orgId, spaceId);
      if (!current || current.communityId !== communityId) {
        this.logger.warn('space link add rejected — space not found', {
          orgId,
          communityId,
          spaceId,
          actorId: actor.id,
        });
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
    this.logger.info('space link added', {
      orgId,
      communityId,
      spaceId,
      contentId,
      actorId: actor.id,
    });
    return this.oneSpaceView(space);
  }

  async removeSpaceLink(
    communityId: string,
    spaceId: string,
    linkId: string,
    actor: Actor,
  ): Promise<SpaceView> {
    this.require(actor, 'communities:write', communityId);
    const orgId = actor.orgId;
    const space = await this.uow.run(async ({ content, outbox }) => {
      const current = await content.findSpace(orgId, spaceId);
      if (!current || current.communityId !== communityId) {
        this.logger.warn('space link remove rejected — space not found', {
          orgId,
          communityId,
          spaceId,
          actorId: actor.id,
        });
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
    this.logger.info('space link removed', {
      orgId,
      communityId,
      spaceId,
      linkId,
      actorId: actor.id,
    });
    return this.oneSpaceView(space);
  }

  async reorderSpaceLinks(
    communityId: string,
    spaceId: string,
    orderedIds: string[],
    actor: Actor,
  ): Promise<SpaceView> {
    this.require(actor, 'communities:write', communityId);
    const orgId = actor.orgId;
    const space = await this.uow.run(async ({ content, outbox }) => {
      const current = await content.findSpace(orgId, spaceId);
      if (!current || current.communityId !== communityId) {
        this.logger.warn('space links reorder rejected — space not found', {
          orgId,
          communityId,
          spaceId,
          actorId: actor.id,
        });
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
    this.logger.info('space links reordered', {
      orgId,
      communityId,
      spaceId,
      actorId: actor.id,
    });
    return this.oneSpaceView(space);
  }
}
