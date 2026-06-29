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
  ListCoursesResponse,
  ListEnrollmentsResponse,
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
export type ModuleItem = Module["items"][number];
export type Lesson = Extract<ModuleItem, { kind: "lesson" }>;
export type Assessment = Extract<ModuleItem, { kind: "assessment" }>;
export type LessonType = Lesson["type"];
export type AssessmentType = Assessment["type"];

export type Student = GetStudentResponse;

export type Enrollment = ListEnrollmentsResponse["rows"][number];
export type EnrollmentStatus = Enrollment["status"];

export type Member = ListMembersResponse["rows"][number];
export type MemberStatus = Member["status"];
export type Role = Member["role"];

export type OverviewStats = GetOverviewResponse;

// --- media library (assets) ------------------------------------------------

export type Asset = GetAssetResponse;
export type AssetKind = Asset["kind"];
export type AssetStatus = Asset["status"];
export type UploadTicket = RequestUploadResponse;
export type DownloadTicket = RequestAssetDownloadResponse;

// Page envelopes (shape: { rows, total, page, pageSize }).
export type CoursesPage = ListCoursesResponse;
export type StudentsPage = ListStudentsResponse;
export type EnrollmentsPage = ListEnrollmentsResponse;
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
