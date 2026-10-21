import type {
  GetMemberViewerResponse,
  ListActivityCommentsResponse,
  GetMemberCourseResponse,
  GetMemberDownloadResponse,
  GetMemberOrgResponse,
  ListMemberCoursesResponse,
  ListMemberDownloadsResponse,
  ListMemberActivitiesResponse,
  ListMemberModulesResponse,
} from "@headless-lms/sdk";

export type Course = GetMemberCourseResponse;
/** The portal org's public identity (branding). */
export type Org = GetMemberOrgResponse;
export type CourseSummary = ListMemberCoursesResponse[number];
export type Module = ListMemberModulesResponse[number];
export type Activity = ListMemberActivitiesResponse[number];

/** One activity's comments as the learner may see them. */
export type ActivityComments = ListActivityCommentsResponse;
export type CommentsConfig = ActivityComments["config"];
export type CommentView = ActivityComments["comments"][number];
export type CommentAuthor = CommentView["author"];
export type ReactionEmoji = NonNullable<CommentView["viewerReaction"]>;
export type ReactionCounts = CommentView["reactions"];
/** Who the caller is inside the session's org. */
export type Viewer = GetMemberViewerResponse;
export type Download = ListMemberDownloadsResponse[number];
export type DownloadDetail = GetMemberDownloadResponse;
export type DownloadAsset = DownloadDetail["assets"][number];

/** The editor-agnostic content wrapper stored under `settings.content`. */
export interface ActivityContent {
  config: unknown;
  type: string;
  version?: number;
}
export interface ActivitySettings {
  title?: string;
  published?: boolean;
  content?: ActivityContent;
}
