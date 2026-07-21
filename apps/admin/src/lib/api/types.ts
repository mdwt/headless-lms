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
  GetCourseResponse,
  GetOverviewResponse,
  GetStudentResponse,
  ListAssetsResponse,
  ListAvailableIntegrationsResponse,
  ListConnectedAppsResponse,
  ListConnectionsResponse,
  ListCoursesResponse,
  ListEntitlementsResponse,
  ListMembersResponse,
  ListModulesResponse,
  ListStudentsResponse,
  RequestAssetDownloadResponse,
  RequestUploadResponse,
} from "@headless-lms/sdk";

// --- entities (straight from the SDK responses) ----------------------------

export type Course = GetCourseResponse;
export type CourseStatus = Course["status"];

export type Module = ListModulesResponse[number];

/**
 * An activity is uniform on the wire: `{ id, moduleId, seq, settings, assetIds }`.
 * Everything content-specific lives in the opaque `settings` blob.
 */
export type Activity = Module["activities"][number];

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
}

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

export type Entitlement = ListEntitlementsResponse["rows"][number];
export type EntitlementStatus = Entitlement["status"];

export type Member = ListMembersResponse["rows"][number];
export type MemberStatus = Member["status"];
export type Role = Member["role"];

export type OverviewStats = GetOverviewResponse;

// --- media library (assets) ------------------------------------------------

export type ConnectedApp = ListConnectedAppsResponse[number];

// --- integrations -----------------------------------------------------------

export type AvailableIntegration = ListAvailableIntegrationsResponse[number];
export type IntegrationConnection = ListConnectionsResponse[number];
export type IntegrationStatus = "connected" | "inactive" | "not_connected";

export type Asset = GetAssetResponse;
export type AssetKind = Asset["kind"];
export type AssetStatus = Asset["status"];
export type UploadTicket = RequestUploadResponse;
export type DownloadTicket = RequestAssetDownloadResponse;

// Page envelopes (shape: { rows, total, page, pageSize }).
export type CoursesPage = ListCoursesResponse;
export type StudentsPage = ListStudentsResponse;
export type EntitlementsPage = ListEntitlementsResponse;
export type MembersPage = ListMembersResponse;
export type AssetsPage = ListAssetsResponse;

// --- auth / session (not part of the resource API) -------------------------

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
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
