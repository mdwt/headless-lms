import type {
  Activity,
  ActivityAsset,
  ActivityView,
  Bundle,
  BundleItem,
  Community,
  CommunityView,
  Course,
  CourseSettings,
  CourseView,
  DigestSchedule,
  DmSettings,
  Download,
  DownloadAsset,
  DownloadFile,
  DownloadView,
  Event,
  EventAsset,
  EventFile,
  EventLead,
  EventSettings,
  EventStatus,
  EventView,
  Module,
  SaveActivityInput,
  Space,
  SpaceDetail,
} from './model.js';
import type {
  AddDownloadAssetInput,
  AddEventAssetInput,
  CreateEventInput,
  ListEventsQuery,
  UpdateEventInput,
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
  PatchCommunitySettingsInput,
  SetSpaceTopicsInput,
  UpdateBundleInput,
  UpdateCommunityInput,
  UpdateCourseInput,
  UpdateDownloadInput,
  UpdateSpaceInput,
} from './types.js';
import type { Actor } from '../shared/actor.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';
import type { SubjectRef } from '../types/index.js';

export interface ContentService
  extends
    DownloadablesService,
    CourseManagementService,
    BundlesService,
    CommunitiesService,
    EventsService {}

export interface ItemTitle {
  title: string;
  excerpt?: string;
}

export interface ItemTitles {
  titlesFor(refs: SubjectRef[], actor: Actor): Promise<Record<string, ItemTitle>>;
}

export interface ItemTitleAccess {
  hasAccess(orgId: string, orgUserId: string, contentId: string): Promise<boolean>;
  isCommunityMember(communityId: string, actor: Actor): Promise<boolean>;
  canOpenSpace(spaceId: string, actor: Actor): Promise<boolean>;
}

export interface LibraryAssetRef {
  id: string;
  contentId: string | null;
}

export interface ContentAssetReader {
  libraryAssetsFor(orgId: string, assetIds: string[]): Promise<LibraryAssetRef[]>;
}

export interface CommunityReader {
  getSpace(spaceId: string, actor: Actor): Promise<SpaceDetail | null>;
  listSpaces(communityId: string, actor: Actor): Promise<SpaceDetail[]>;
  getDmSettings(communityId: string, actor: Actor): Promise<DmSettings | null>;
}

export interface SpaceRowLock {
  lockSpace(orgId: string, spaceId: string): Promise<Space | null>;
}

export interface CommunityDigest {
  orgId: string;
  communityId: string;
  digest: DigestSchedule;
}

export interface CommunitiesService extends CommunityReader {
  listCommunities(query: ListCommunitiesQuery, actor: Actor): Promise<Page<CommunityView>>;
  getCommunity(id: string, actor: Actor): Promise<CommunityView>;
  findCommunity(id: string, actor: Actor): Promise<CommunityView | null>;
  communitiesWithDigest(): Promise<CommunityDigest[]>;
  listCommunitiesById(ids: string[], actor: Actor): Promise<Community[]>;
  getCommunitySpace(communityId: string, spaceId: string, actor: Actor): Promise<SpaceDetail>;
  createCommunity(input: CreateCommunityInput, actor: Actor): Promise<CommunityView>;
  updateCommunity(id: string, patch: UpdateCommunityInput, actor: Actor): Promise<CommunityView>;
  publishCommunity(id: string, actor: Actor): Promise<CommunityView>;
  unpublishCommunity(id: string, actor: Actor): Promise<CommunityView>;
  deleteCommunity(id: string, actor: Actor): Promise<void>;
  patchCommunitySettings(
    id: string,
    patch: PatchCommunitySettingsInput,
    actor: Actor,
  ): Promise<CommunityView>;

  createSpace(communityId: string, input: CreateSpaceInput, actor: Actor): Promise<SpaceDetail>;
  updateSpace(
    communityId: string,
    spaceId: string,
    patch: UpdateSpaceInput,
    actor: Actor,
  ): Promise<SpaceDetail>;
  deleteSpace(communityId: string, spaceId: string, actor: Actor): Promise<void>;
  reorderSpaces(communityId: string, orderedIds: string[], actor: Actor): Promise<SpaceDetail[]>;
  setSpaceTopics(
    communityId: string,
    spaceId: string,
    input: SetSpaceTopicsInput,
    actor: Actor,
  ): Promise<SpaceDetail>;
  addSpaceLink(
    communityId: string,
    spaceId: string,
    contentId: string,
    actor: Actor,
  ): Promise<SpaceDetail>;
  removeSpaceLink(
    communityId: string,
    spaceId: string,
    linkId: string,
    actor: Actor,
  ): Promise<SpaceDetail>;
  reorderSpaceLinks(
    communityId: string,
    spaceId: string,
    orderedIds: string[],
    actor: Actor,
  ): Promise<SpaceDetail>;
}

export interface CourseManagementService {
  listCourses(query: ListCoursesQuery, actor: Actor): Promise<Page<CourseView>>;
  getCourse(id: string, actor: Actor): Promise<CourseView>;
  findCourse(id: string, actor: Actor): Promise<CourseView | null>;
  createCourse(input: CreateCourseInput, actor: Actor): Promise<CourseView>;
  /** @throws NotFoundError when no course with this id exists in the org. */
  updateCourse(id: string, patch: UpdateCourseInput, actor: Actor): Promise<CourseView>;
  /** @throws NotFoundError when no course with this id exists in the org. */
  patchCourseSettings(
    id: string,
    value: Partial<CourseSettings>,
    actor: Actor,
  ): Promise<CourseSettings>;
  /** @throws NotFoundError when no course with this id exists in the org. */
  deleteCourse(id: string, actor: Actor): Promise<void>;

  listCourseModules(courseId: string, actor: Actor): Promise<Module[]>;
  listCourseActivities(courseId: string, actor: Actor): Promise<Activity[]>;
  listCourseActivityViews(courseId: string, actor: Actor): Promise<ActivityView[]>;
  listCourseActivityAssets(courseId: string, actor: Actor): Promise<ActivityAsset[]>;
  getActivity(activityId: string, actor: Actor): Promise<Activity | null>;
  getModule(moduleId: string, actor: Actor): Promise<Module | null>;
  reorderModules(courseId: string, orderedIds: string[], actor: Actor): Promise<Module[]>;
  createModule(courseId: string, title: string, actor: Actor): Promise<Module[]>;
  /** @throws NotFoundError when no such module exists in this course. */
  updateModule(courseId: string, moduleId: string, title: string, actor: Actor): Promise<Module[]>;
  /** @throws NotFoundError when no such module exists in this course. */
  deleteModule(courseId: string, moduleId: string, actor: Actor): Promise<Module[]>;
  /** @throws NotFoundError when no such module exists in this course. */
  reorderActivities(
    courseId: string,
    moduleId: string,
    orderedIds: string[],
    actor: Actor,
  ): Promise<Module[]>;
  /** @throws NotFoundError when the module — or, on update, the activity — does not exist. */
  saveActivity(
    courseId: string,
    moduleId: string,
    input: SaveActivityInput,
    activityId: string | null,
    actor: Actor,
  ): Promise<Module[]>;
  /** @throws NotFoundError when no such activity exists in this module. */
  deleteActivity(
    courseId: string,
    moduleId: string,
    activityId: string,
    actor: Actor,
  ): Promise<Module[]>;
}

export interface DownloadablesService {
  listDownloads(query: ListDownloadsQuery, actor: Actor): Promise<Page<DownloadView>>;
  getDownload(id: string, actor: Actor): Promise<DownloadView>;
  findDownload(id: string, actor: Actor): Promise<DownloadView | null>;
  createDownload(input: CreateDownloadInput, actor: Actor): Promise<DownloadView>;
  /** @throws NotFoundError when no download with this id exists in the org. */
  updateDownload(id: string, patch: UpdateDownloadInput, actor: Actor): Promise<DownloadView>;
  /** @throws NotFoundError when no download with this id exists in the org. */
  removeDownload(id: string, actor: Actor): Promise<void>;

  listDownloadAssets(downloadId: string, actor: Actor): Promise<DownloadFile[]>;
  addDownloadAsset(
    downloadId: string,
    input: AddDownloadAssetInput,
    actor: Actor,
  ): Promise<DownloadFile[]>;
  removeDownloadAsset(downloadId: string, assetId: string, actor: Actor): Promise<DownloadFile[]>;
  renameDownloadAsset(
    downloadId: string,
    assetId: string,
    displayName: string | null,
    actor: Actor,
  ): Promise<DownloadFile[]>;
  /** @throws ConflictError when assetIds is not exactly the download's current asset set. */
  reorderDownloadAssets(
    downloadId: string,
    assetIds: string[],
    actor: Actor,
  ): Promise<DownloadFile[]>;
}

export interface EventsService {
  listEvents(query: ListEventsQuery, actor: Actor): Promise<Page<EventView>>;
  getEvent(id: string, actor: Actor): Promise<EventView>;
  findEvent(id: string, actor: Actor): Promise<EventView | null>;
  createEvent(input: CreateEventInput, actor: Actor): Promise<EventView>;
  /** @throws ConflictError with code `canceled` when the event is canceled. */
  updateEvent(id: string, patch: UpdateEventInput, actor: Actor): Promise<EventView>;
  /** @throws ConflictError with code `canceled` when the event is already canceled. */
  cancelEvent(id: string, actor: Actor): Promise<EventView>;
  deleteEvent(id: string, actor: Actor): Promise<void>;
  startingSoon(orgId: string, eventId: string, lead: EventLead, now: Date): Promise<void>;

  listEventAssets(eventId: string, actor: Actor): Promise<EventFile[]>;
  addEventAsset(eventId: string, input: AddEventAssetInput, actor: Actor): Promise<EventFile[]>;
  removeEventAsset(eventId: string, assetId: string, actor: Actor): Promise<EventFile[]>;
  renameEventAsset(
    eventId: string,
    assetId: string,
    displayName: string | null,
    actor: Actor,
  ): Promise<EventFile[]>;
  /** @throws ConflictError when assetIds is not exactly the event's current asset set. */
  reorderEventAssets(eventId: string, assetIds: string[], actor: Actor): Promise<EventFile[]>;
}

export type EventPatch = Omit<UpdateEventInput, 'status' | 'settings'> & { status?: EventStatus };

export interface BundlesService {
  listBundles(query: ListBundlesQuery, actor: Actor): Promise<Page<Bundle>>;
  getBundle(id: string, actor: Actor): Promise<Bundle>;
  findBundle(id: string, actor: Actor): Promise<Bundle | null>;
  /** Bundle and its initial items are created together, or not at all.
   *  @throws NotFoundError when an initial content id does not exist in the org. */
  createBundle(input: CreateBundleInput, actor: Actor): Promise<Bundle>;
  /** @throws NotFoundError when no bundle with this id exists in the org. */
  updateBundle(id: string, patch: UpdateBundleInput, actor: Actor): Promise<Bundle>;
  /** @throws NotFoundError when no bundle with this id exists in the org. */
  deleteBundle(id: string, actor: Actor): Promise<void>;

  listBundleItems(bundleId: string, actor: Actor): Promise<BundleItem[]>;
  /** @throws NotFoundError when the bundle — or the content — does not exist in the org. */
  addBundleItem(bundleId: string, contentId: string, actor: Actor): Promise<BundleItem[]>;
  /** @throws NotFoundError when no bundle with this id exists in the org. */
  removeBundleItem(bundleId: string, contentId: string, actor: Actor): Promise<BundleItem[]>;
}

export interface ContentRepository {
  listCourses(orgId: string, query: ListCoursesQuery, ids?: string[]): Promise<Page<Course>>;
  findCourseById(orgId: string, id: string): Promise<Course | null>;
  createCourse(orgId: string, input: CreateCourseInput, slug: string): Promise<Course>;
  updateCourse(orgId: string, id: string, patch: UpdateCourseInput): Promise<Course | null>;
  patchCourseSettings(
    orgId: string,
    id: string,
    value: Partial<CourseSettings>,
  ): Promise<CourseSettings>;
  deleteCourse(orgId: string, id: string): Promise<boolean>;

  listCourseModules(orgId: string, courseId: string): Promise<Module[]>;
  listActivitiesForCourse(orgId: string, courseId: string): Promise<Activity[]>;
  listActivityAssetsForCourse(orgId: string, courseId: string): Promise<ActivityAsset[]>;
  findActivity(orgId: string, activityId: string): Promise<Activity | null>;
  findModule(orgId: string, moduleId: string): Promise<Module | null>;
  reorderModules(orgId: string, courseId: string, orderedIds: string[]): Promise<Module[]>;
  createModule(orgId: string, courseId: string, title: string): Promise<Module[]>;
  updateModule(orgId: string, courseId: string, moduleId: string, title: string): Promise<Module[]>;
  deleteModule(orgId: string, courseId: string, moduleId: string): Promise<Module[]>;
  reorderActivities(
    orgId: string,
    courseId: string,
    moduleId: string,
    orderedIds: string[],
  ): Promise<Module[]>;
  saveActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    input: SaveActivityInput,
    activityId?: string,
  ): Promise<{ modules: Module[]; activity: Activity }>;
  deleteActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    activityId: string,
  ): Promise<Module[]>;

  listDownloads(orgId: string, query: ListDownloadsQuery, ids?: string[]): Promise<Page<Download>>;
  getDownload(orgId: string, id: string): Promise<Download | null>;
  createDownload(orgId: string, input: CreateDownloadInput, slug: string): Promise<Download>;
  updateDownload(orgId: string, id: string, patch: UpdateDownloadInput): Promise<Download | null>;
  deleteDownload(orgId: string, id: string): Promise<boolean>;

  listDownloadAssets(orgId: string, downloadId: string): Promise<DownloadAsset[]>;
  addDownloadAsset(
    orgId: string,
    downloadId: string,
    input: AddDownloadAssetInput,
  ): Promise<DownloadAsset[]>;
  removeDownloadAsset(orgId: string, downloadId: string, assetId: string): Promise<DownloadAsset[]>;
  renameDownloadAsset(
    orgId: string,
    downloadId: string,
    assetId: string,
    displayName: string | null,
  ): Promise<DownloadAsset[]>;
  reorderDownloadAssets(
    orgId: string,
    downloadId: string,
    assetIds: string[],
  ): Promise<DownloadAsset[]>;

  listEvents(orgId: string, query: ListEventsQuery, ids?: string[]): Promise<Page<Event>>;
  findEventById(orgId: string, id: string): Promise<Event | null>;
  createEvent(orgId: string, input: Omit<CreateEventInput, 'settings'>): Promise<Event>;
  updateEvent(orgId: string, id: string, patch: EventPatch): Promise<Event | null>;
  patchEventSettings(
    orgId: string,
    id: string,
    value: Partial<EventSettings>,
  ): Promise<EventSettings>;
  deleteEvent(orgId: string, id: string): Promise<boolean>;
  deleteEventSettings(orgId: string, id: string): Promise<void>;

  listEventAssets(orgId: string, eventId: string): Promise<EventAsset[]>;
  addEventAsset(orgId: string, eventId: string, input: AddEventAssetInput): Promise<EventAsset[]>;
  removeEventAsset(orgId: string, eventId: string, assetId: string): Promise<EventAsset[]>;
  renameEventAsset(
    orgId: string,
    eventId: string,
    assetId: string,
    displayName: string | null,
  ): Promise<EventAsset[]>;
  reorderEventAssets(orgId: string, eventId: string, assetIds: string[]): Promise<EventAsset[]>;

  listBundles(orgId: string, query: ListBundlesQuery): Promise<Page<Bundle>>;
  findBundleById(orgId: string, id: string): Promise<Bundle | null>;
  createBundle(orgId: string, input: CreateBundleInput): Promise<Bundle>;
  updateBundle(orgId: string, id: string, patch: UpdateBundleInput): Promise<Bundle | null>;
  deleteBundle(orgId: string, id: string): Promise<boolean>;

  listBundleItems(orgId: string, bundleId: string): Promise<BundleItem[]>;
  /** Content already in the bundle is left as it is — adding twice is a no-op. */
  addBundleItem(orgId: string, bundleId: string, contentId: string): Promise<BundleItem[]>;
  removeBundleItem(orgId: string, bundleId: string, contentId: string): Promise<BundleItem[]>;

  listCommunities(
    orgId: string,
    query: ListCommunitiesQuery,
    ids?: string[],
  ): Promise<Page<Community>>;
  findCommunityById(orgId: string, id: string): Promise<Community | null>;
  findCommunitiesByIds(orgId: string, ids: string[]): Promise<Community[]>;
  communitiesWithDigest(): Promise<CommunityDigest[]>;
  createCommunity(orgId: string, input: CreateCommunityInput, slug: string): Promise<Community>;
  updateCommunity(
    orgId: string,
    id: string,
    patch: UpdateCommunityInput,
  ): Promise<Community | null>;
  patchCommunitySettings(
    orgId: string,
    id: string,
    patch: PatchCommunitySettingsInput,
  ): Promise<Community | null>;
  deleteCommunity(orgId: string, id: string): Promise<boolean>;
  deleteCommunitySettings(orgId: string, id: string): Promise<void>;

  listSpaces(orgId: string, communityId: string): Promise<SpaceDetail[]>;
  findSpace(orgId: string, spaceId: string): Promise<SpaceDetail | null>;
  lockSpace(orgId: string, spaceId: string): Promise<Space | null>;
  createSpace(orgId: string, communityId: string, input: CreateSpaceInput): Promise<SpaceDetail>;
  updateSpace(
    orgId: string,
    communityId: string,
    spaceId: string,
    patch: UpdateSpaceInput,
  ): Promise<SpaceDetail | null>;
  deleteSpace(orgId: string, communityId: string, spaceId: string): Promise<boolean>;
  reorderSpaces(orgId: string, communityId: string, orderedIds: string[]): Promise<SpaceDetail[]>;
  setSpaceTopics(orgId: string, spaceId: string, input: SetSpaceTopicsInput): Promise<SpaceDetail>;
  topicsInUse(orgId: string, spaceId: string, topicIds: string[]): Promise<string[]>;
  addSpaceLink(orgId: string, spaceId: string, contentId: string): Promise<SpaceDetail>;
  removeSpaceLink(orgId: string, spaceId: string, linkId: string): Promise<SpaceDetail>;
  reorderSpaceLinks(orgId: string, spaceId: string, orderedIds: string[]): Promise<SpaceDetail>;
  spacesLinkingContent(orgId: string, contentId: string): Promise<string[]>;
}

export interface ContentTxScope {
  content: ContentRepository;
  outbox: OutboxAppender;
}

export type ContentUnitOfWork = UnitOfWork<ContentTxScope>;
