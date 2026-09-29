/**
 * Domain types for the management dashboard.
 *
 * These are derived from the generated SDK (`@headless-lms/sdk`), which is
 * generated from the API contract package — a single source of truth shared by
 * the server, the OpenAPI spec, and this client. The hand-written mock types
 * are gone; everything here tracks the real API.
 */

import type {
  GetAssetResponse,
  GetAutomationResponse,
  GetCourseResponse,
  ListCommentsResponse,
  GetBundleResponse,
  GetDownloadResponse,
  GetCourseAnalyticsResponse,
  GetEnrollmentSeriesResponse,
  GetOverviewResponse,
  GetStudentAnalyticsResponse,
  GetStudentResponse,
  GetWebhookResponse,
  ListActivitiesResponse,
  ListActivityAssetsResponse,
  ListAssetsResponse,
  ListAutomationActionsResponse,
  ListAutomationRunsResponse,
  ListAutomationTriggersResponse,
  ListAvailableIntegrationsResponse,
  ListBundleItemsResponse,
  ListBundlesResponse,
  ListConnectionsResponse,
  ListCoursesResponse,
  ListDownloadAssetsResponse,
  ListDownloadsResponse,
  ListEntitlementsResponse,
  ListMembersResponse,
  ListModulesResponse,
  ListStudentsResponse,
  RequestAssetDownloadResponse,
  RequestUploadResponse,
  UpdateCourseSettingsResponse,
} from "@headless-lms/sdk";

// --- entities (straight from the SDK responses) ----------------------------

export type Course = GetCourseResponse;
export type CourseStatus = Course["status"];
/** Course-wide delivery settings, served composed and complete on the course. */
export type CourseSettings = UpdateCourseSettingsResponse;

export type Download = GetDownloadResponse;
export type DownloadStatus = Download["status"];
/** Bare download→asset link row, exactly as the API stores it. */
export type DownloadAssetLink = ListDownloadAssetsResponse[number];
/** A link row joined client-side with its asset's file metadata for display. */
export type DownloadAsset = DownloadAssetLink & {
  filename: string;
  contentType: string;
  size: number;
};

export type Bundle = GetBundleResponse;
/** Bare bundle→content link row, exactly as the API stores it. */
export type BundleItem = ListBundleItemsResponse[number];
/** A bundle joined server-side with the ids of the content it contains. */
export type BundleRow = Bundle & { contentIds: string[] };

export type Module = ListModulesResponse[number];

/**
 * An activity as the API serves it: a bare row whose content-specific data
 * lives in the opaque `settings` blob. Asset links are their own resource
 * (`listActivityAssets`); `ActivityNode` carries them joined client-side.
 */
export type Activity = ListActivitiesResponse[number];
export type ActivityAssetLink = ListActivityAssetsResponse[number];
export type ActivityNode = Activity & { assetIds: string[] };

/** The module→activity tree, composed client-side from the bare lists. */
export type ModuleTree = Module & { activities: ActivityNode[] };

/**
 * The activity's authored content, stored inside `settings.content`. `config`
 * is the installed editor's opaque output blob; `type` (+ optional `version`)
 * tags which editor format produced it, so renderers can refuse foreign blobs.
 * Deliberately editor-agnostic — no editor types leak into the store or here.
 */
export interface ActivityContent {
  config: unknown;
  type: string;
  version?: number;
}

/**
 * Admin-side view of the opaque `settings` blob. The API stores it as `unknown`;
 * the editor reads/writes these fields, defaulting anything missing.
 */
export interface ActivitySettings {
  title?: string;
  body?: string;
  published?: boolean;
  content?: ActivityContent;
  /** What marks this activity complete for a student. */
  completion?: ActivityCompletionRule;
  /** Per-activity override of the course's transcript-download setting. */
  transcriptDownloads?: ActivityTranscriptRule;
  /** Per-activity override of the course's comments setting. */
  comments?: ActivityCommentsRule;
}

export type ActivityCompletionRule = "view" | "video" | "manual";
export type ActivityTranscriptRule = "inherit" | "always" | "never";
export type ActivityCommentsRule = "inherit" | "always" | "never";

/**
 * Form payload for creating/updating an activity. Maps onto the SDK's
 * `SaveActivity` body (`{ settings?, assetIds? }`); `api.saveActivity` sends it.
 */
export interface SaveActivityInput {
  id?: string;
  settings?: unknown;
  assetIds?: string[];
}

export type Student = GetStudentResponse;

/** Bare entitlement grant row, exactly as the API stores it. */
export type EntitlementGrant = ListEntitlementsResponse["rows"][number];
/** active|expired|revoked — `expired` is derived client-side from `expiresAt`. */
export type EntitlementStatus = EntitlementGrant["status"] | "expired";

/**
 * A grant row joined client-side with the student's identity and the granted
 * target's title (each its own resource on the API), plus the derived status.
 * A grant targets either a content item or a bundle; `content` carries
 * whichever one it is.
 */
export type Entitlement = Omit<EntitlementGrant, "status"> & {
  status: EntitlementStatus;
  firstName: string | null;
  lastName: string | null;
  email: string;
  content: { id: string; type: "course" | "download" | "bundle"; title: string };
};

export type Member = ListMembersResponse["rows"][number];
export type MemberStatus = Member["status"];
export type Role = Member["role"];

export type OverviewStats = GetOverviewResponse;
export type EnrollmentSeries = GetEnrollmentSeriesResponse;
export type EnrollmentPoint = EnrollmentSeries[number];
export type CourseAnalytics = GetCourseAnalyticsResponse;
export type CourseActivityEngagement = CourseAnalytics["activities"][number];
export type StudentAnalytics = GetStudentAnalyticsResponse;
export type StudentCourseProgress = StudentAnalytics["courses"][number];

// --- media library (assets) ------------------------------------------------

// --- integrations -----------------------------------------------------------

export type AvailableIntegration = ListAvailableIntegrationsResponse[number];
export type IntegrationConnection = ListConnectionsResponse[number];
export type IntegrationStatus = "connected" | "inactive" | "not_connected";

// --- automations ------------------------------------------------------------

export type Automation = GetAutomationResponse;
export type AutomationKind = Automation["kind"];
export type AutomationAction = Automation["actions"][number];
export type AutomationRunsPage = ListAutomationRunsResponse;
export type AutomationRun = AutomationRunsPage["rows"][number];
export type AutomationRunStatus = AutomationRun["status"];
export type Webhook = GetWebhookResponse;
export type AvailableAction = ListAutomationActionsResponse[number];
export type AutomationTriggerInfo = ListAutomationTriggersResponse["triggers"][number];

export type Asset = GetAssetResponse;
export type AssetKind = Asset["kind"];
export type AssetStatus = Asset["status"];
export type UploadTicket = RequestUploadResponse;
export type DownloadTicket = RequestAssetDownloadResponse;

// Page envelopes (shape: { rows, total, page, pageSize }).
export type CoursesPage = ListCoursesResponse;
export type DownloadsPage = ListDownloadsResponse;
export type BundlesPage = ListBundlesResponse;
export type StudentsPage = ListStudentsResponse;
export type EntitlementsPage = ListEntitlementsResponse;
export type MembersPage = ListMembersResponse;
export type AssetsPage = ListAssetsResponse;

// --- discussion --------------------------------------------------------------

export type CommentsPage = ListCommentsResponse;
export type CommentListItem = CommentsPage["rows"][number];
export type CommentReportSummary = CommentListItem["reports"][number];
export type CommentStatus = CommentListItem["status"];
/** A course's comment settings. Not a resource of its own: they ride on the
 *  course payload, so read and write both go through course settings. */
export type CommentSettings = NonNullable<CourseSettings["comments"]>;

// --- auth / session (not part of the resource API) -------------------------

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  /** Active org role + the courses an instructor is scoped to. */
  role: Role;
  scopedCourseIds: string[];
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

// --- list transport (client-side table state → API query) ------------------

export interface ListParams {
  page: number;
  pageSize: number;
  search?: string;
  sort?: { id: string; desc: boolean }[];
  /** column id -> selected values (faceted filters). */
  filters?: Record<string, string[]>;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
