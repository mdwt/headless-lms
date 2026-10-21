import type {
  Activity,
  ActivityAsset,
  Bundle,
  BundleItem,
  Community,
  Course,
  CourseSettings,
  DmSettings,
  Download,
  DownloadAsset,
  Module,
  SaveActivityInput,
  Space,
  SpaceDetail,
} from './model.js';
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
import type { Actor } from '../shared/actor.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';

export interface ContentService
  extends DownloadablesService, CourseManagementService, CommunitiesService {}

export interface CommunityReader {
  getSpace(orgId: string, spaceId: string): Promise<SpaceDetail | null>;
  listSpaces(orgId: string, communityId: string): Promise<SpaceDetail[]>;
  getDmSettings(orgId: string, communityId: string): Promise<DmSettings | null>;
}

export interface SpaceRowLock {
  lockSpace(orgId: string, spaceId: string): Promise<Space | null>;
}

export interface CommunitiesService extends CommunityReader {
  listCommunities(orgId: string, query: ListCommunitiesQuery): Promise<Page<Community>>;
  getCommunity(orgId: string, id: string): Promise<Community | null>;
  createCommunity(orgId: string, input: CreateCommunityInput, actor: Actor): Promise<Community>;
  updateCommunity(
    orgId: string,
    id: string,
    patch: UpdateCommunityInput,
    actor: Actor,
  ): Promise<Community>;
  publishCommunity(orgId: string, id: string, actor: Actor): Promise<Community>;
  unpublishCommunity(orgId: string, id: string, actor: Actor): Promise<Community>;
  deleteCommunity(orgId: string, id: string, actor: Actor): Promise<void>;
  patchDmSettings(
    orgId: string,
    id: string,
    patch: PatchDmSettingsInput,
    actor: Actor,
  ): Promise<Community>;

  createSpace(
    orgId: string,
    communityId: string,
    input: CreateSpaceInput,
    actor: Actor,
  ): Promise<SpaceDetail>;
  updateSpace(
    orgId: string,
    communityId: string,
    spaceId: string,
    patch: UpdateSpaceInput,
    actor: Actor,
  ): Promise<SpaceDetail>;
  deleteSpace(orgId: string, communityId: string, spaceId: string, actor: Actor): Promise<void>;
  reorderSpaces(
    orgId: string,
    communityId: string,
    orderedIds: string[],
    actor: Actor,
  ): Promise<SpaceDetail[]>;
  setSpaceTopics(
    orgId: string,
    communityId: string,
    spaceId: string,
    input: SetSpaceTopicsInput,
    actor: Actor,
  ): Promise<SpaceDetail>;
  addSpaceLink(
    orgId: string,
    communityId: string,
    spaceId: string,
    contentId: string,
    actor: Actor,
  ): Promise<SpaceDetail>;
  removeSpaceLink(
    orgId: string,
    communityId: string,
    spaceId: string,
    linkId: string,
    actor: Actor,
  ): Promise<SpaceDetail>;
  reorderSpaceLinks(
    orgId: string,
    communityId: string,
    spaceId: string,
    orderedIds: string[],
    actor: Actor,
  ): Promise<SpaceDetail>;
}

export interface CourseManagementService {
  listCourses(orgId: string, query: ListCoursesQuery): Promise<Page<Course>>;
  getCourse(orgId: string, id: string): Promise<Course | null>;
  createCourse(orgId: string, input: CreateCourseInput): Promise<Course>;
  /** @throws NotFoundError when no course with this id exists in the org. */
  updateCourse(orgId: string, id: string, patch: UpdateCourseInput): Promise<Course>;
  /** @throws NotFoundError when no course with this id exists in the org. */
  patchCourseSettings(
    orgId: string,
    id: string,
    value: Partial<CourseSettings>,
  ): Promise<CourseSettings>;
  /** @throws NotFoundError when no course with this id exists in the org. */
  deleteCourse(orgId: string, id: string): Promise<void>;

  listCourseModules(orgId: string, courseId: string): Promise<Module[]>;
  listCourseActivities(orgId: string, courseId: string): Promise<Activity[]>;
  listCourseActivityAssets(orgId: string, courseId: string): Promise<ActivityAsset[]>;
  getActivity(orgId: string, activityId: string): Promise<Activity | null>;
  getModule(orgId: string, moduleId: string): Promise<Module | null>;
  reorderModules(orgId: string, courseId: string, orderedIds: string[]): Promise<Module[]>;
  createModule(orgId: string, courseId: string, title: string): Promise<Module[]>;
  /** @throws NotFoundError when no such module exists in this course. */
  updateModule(orgId: string, courseId: string, moduleId: string, title: string): Promise<Module[]>;
  /** @throws NotFoundError when no such module exists in this course. */
  deleteModule(orgId: string, courseId: string, moduleId: string): Promise<Module[]>;
  /** @throws NotFoundError when no such module exists in this course. */
  reorderActivities(
    orgId: string,
    courseId: string,
    moduleId: string,
    orderedIds: string[],
  ): Promise<Module[]>;
  /** @throws NotFoundError when the module — or, on update, the activity — does not exist. */
  saveActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    input: SaveActivityInput,
    activityId?: string,
  ): Promise<Module[]>;
  /** @throws NotFoundError when no such activity exists in this module. */
  deleteActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    activityId: string,
  ): Promise<Module[]>;
}

export interface DownloadablesService {
  listDownloads(orgId: string, query: ListDownloadsQuery): Promise<Page<Download>>;
  getDownload(orgId: string, id: string): Promise<Download | null>;
  createDownload(orgId: string, input: CreateDownloadInput): Promise<Download>;
  /** @throws NotFoundError when no download with this id exists in the org. */
  updateDownload(orgId: string, id: string, patch: UpdateDownloadInput): Promise<Download>;
  /** @throws NotFoundError when no download with this id exists in the org. */
  removeDownload(orgId: string, id: string): Promise<void>;

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
  /** @throws ConflictError when assetIds is not exactly the download's current asset set. */
  reorderDownloadAssets(
    orgId: string,
    downloadId: string,
    assetIds: string[],
  ): Promise<DownloadAsset[]>;
}

export interface BundlesService {
  listBundles(orgId: string, query: ListBundlesQuery): Promise<Page<Bundle>>;
  getBundle(orgId: string, id: string): Promise<Bundle | null>;
  /** Bundle and its initial items are created together, or not at all.
   *  @throws NotFoundError when an initial content id does not exist in the org. */
  createBundle(orgId: string, input: CreateBundleInput): Promise<Bundle>;
  /** @throws NotFoundError when no bundle with this id exists in the org. */
  updateBundle(orgId: string, id: string, patch: UpdateBundleInput): Promise<Bundle>;
  /** @throws NotFoundError when no bundle with this id exists in the org. */
  deleteBundle(orgId: string, id: string): Promise<void>;

  listBundleItems(orgId: string, bundleId: string): Promise<BundleItem[]>;
  /** @throws NotFoundError when the bundle — or the content — does not exist in the org. */
  addBundleItem(orgId: string, bundleId: string, contentId: string): Promise<BundleItem[]>;
  /** @throws NotFoundError when no bundle with this id exists in the org. */
  removeBundleItem(orgId: string, bundleId: string, contentId: string): Promise<BundleItem[]>;
}

export interface ContentRepository {
  listCourses(orgId: string, query: ListCoursesQuery): Promise<Page<Course>>;
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

  listDownloads(orgId: string, query: ListDownloadsQuery): Promise<Page<Download>>;
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

  listBundles(orgId: string, query: ListBundlesQuery): Promise<Page<Bundle>>;
  findBundleById(orgId: string, id: string): Promise<Bundle | null>;
  createBundle(orgId: string, input: CreateBundleInput): Promise<Bundle>;
  updateBundle(orgId: string, id: string, patch: UpdateBundleInput): Promise<Bundle | null>;
  deleteBundle(orgId: string, id: string): Promise<boolean>;

  listBundleItems(orgId: string, bundleId: string): Promise<BundleItem[]>;
  /** Content already in the bundle is left as it is — adding twice is a no-op. */
  addBundleItem(orgId: string, bundleId: string, contentId: string): Promise<BundleItem[]>;
  removeBundleItem(orgId: string, bundleId: string, contentId: string): Promise<BundleItem[]>;

  listCommunities(orgId: string, query: ListCommunitiesQuery): Promise<Page<Community>>;
  findCommunityById(orgId: string, id: string): Promise<Community | null>;
  createCommunity(orgId: string, input: CreateCommunityInput, slug: string): Promise<Community>;
  updateCommunity(orgId: string, id: string, patch: UpdateCommunityInput): Promise<Community | null>;
  patchDmSettings(
    orgId: string,
    id: string,
    patch: PatchDmSettingsInput,
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
