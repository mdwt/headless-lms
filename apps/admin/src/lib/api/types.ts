/**
 * Domain types for the management dashboard.
 *
 * These mirror the eventual REST API payloads. Every component and hook is
 * driven by these shapes, so swapping the mock transport (see `mock-server.ts`)
 * for the real API is a one-file change — no component edits required.
 */

// ---------------------------------------------------------------------------
// Auth / identity
// ---------------------------------------------------------------------------

/** Org-scoped roles, mirrored from better-auth's organization plugin. */
export type Role = "owner" | "admin" | "instructor" | "student";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  /** Active org role + the courses an instructor is scoped to. */
  role: Role;
  /** Course ids an instructor may manage/grade; empty for owner/admin (all). */
  scopedCourseIds: string[];
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

// ---------------------------------------------------------------------------
// Courses · modules · items
// ---------------------------------------------------------------------------

export type CourseStatus = "draft" | "published";

export type LessonType = "video" | "text" | "pdf" | "audio" | "download" | "embed";
export type AssessmentType = "quiz" | "assignment";
export type ModuleItemKind = "lesson" | "assessment";

export interface Course {
  id: string;
  title: string;
  slug: string;
  description: string;
  status: CourseStatus;
  category: string;
  instructorId: string;
  instructorName: string;
  moduleCount: number;
  lessonCount: number;
  enrolledCount: number;
  updatedAt: string;
  createdAt: string;
}

export interface Lesson {
  id: string;
  moduleId: string;
  kind: "lesson";
  title: string;
  order: number;
  type: LessonType;
  /** Type-specific payload (url, body, fileName…). Loosely typed for the mock. */
  durationLabel?: string;
  published: boolean;
}

export interface Assessment {
  id: string;
  moduleId: string;
  kind: "assessment";
  title: string;
  order: number;
  type: AssessmentType;
  questionCount?: number;
  pointsPossible?: number;
  published: boolean;
}

export type ModuleItem = Lesson | Assessment;

export interface Module {
  id: string;
  courseId: string;
  title: string;
  order: number;
  items: ModuleItem[];
}

// ---------------------------------------------------------------------------
// Students · enrollments
// ---------------------------------------------------------------------------

export type EnrollmentStatus = "active" | "expired" | "revoked";

export interface Student {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  enrollmentCount: number;
  /** 0–100, averaged across active enrollments. */
  avgProgress: number;
  joinedAt: string;
  lastActiveAt: string | null;
}

export interface Enrollment {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  courseId: string;
  courseTitle: string;
  status: EnrollmentStatus;
  progressPercent: number;
  grantedAt: string;
  expiresAt: string | null;
  source: "manual" | "purchase" | "import";
}

// ---------------------------------------------------------------------------
// Grading queue (assignment submissions)
// ---------------------------------------------------------------------------

export type SubmissionStatus = "pending" | "graded" | "returned";

export interface Submission {
  id: string;
  assessmentId: string;
  assessmentTitle: string;
  courseId: string;
  courseTitle: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  status: SubmissionStatus;
  submittedAt: string;
  pointsPossible: number;
  score: number | null;
  feedback: string | null;
  /** Mock body of the student's submission. */
  responsePreview: string;
}

// ---------------------------------------------------------------------------
// Org / team
// ---------------------------------------------------------------------------

export type MemberStatus = "active" | "invited";

export interface Member {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: Role;
  status: MemberStatus;
  joinedAt: string | null;
  invitedAt: string | null;
}

// ---------------------------------------------------------------------------
// List transport — server-side pagination / sort / filter (mocked)
// ---------------------------------------------------------------------------

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

export interface OverviewStats {
  publishedCourses: number;
  draftCourses: number;
  activeStudents: number;
  activeEnrollments: number;
  pendingSubmissions: number;
  expiringSoon: number;
}
