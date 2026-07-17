// content context — domain entities, DTOs, and events.
//
// Aggregate shape (mirrors the frozen schema):
//   Course → Module → ordered Activity. An Activity is the leaf sitting directly
//   in a module: UNIFORM content the domain does not categorise — a `seq` and an
//   opaque `settings` blob holding whatever the content needs (title, type, body,
//   completion rule, …). Assets are the one thing kept OUT of the blob (owned by
//   the assets domain) and surfaced here as `Activity.assetIds`.

export type CourseStatus = "draft" | "published";

export interface Course {
  readonly id: string;
  title: string;
  slug: string;
  description: string;
  status: CourseStatus;
  category: string;
  moduleCount: number;
  activityCount: number;
  enrolledCount: number;
  updatedAt: string;
  createdAt: string;
}

/** The leaf, directly in a module. Uniform content: seq + opaque settings blob. */
export interface Activity {
  readonly id: string;
  moduleId: string;
  seq: number;
  /** Opaque per-activity blob (title, type, body, completion rule, …). Not modelled. */
  settings: unknown;
  /** Media-library assets backing this activity (activity_assets), ordered. */
  assetIds: string[];
}

export interface Module {
  readonly id: string;
  courseId: string;
  title: string;
  seq: number;
  activities: Activity[];
}

/** Upsert payload for an activity: opaque settings + its ordered asset links. */
export interface SaveActivityInput {
  settings?: unknown;
  assetIds?: string[];
}

export interface ListCoursesQuery {
  page: number;
  pageSize: number;
  search?: string | undefined;
  /** Sort field, optionally `-` prefixed for descending (e.g. `-updatedAt`). */
  sort?: string | undefined;
  status?: CourseStatus | undefined;
  category?: string | undefined;
}

export interface CreateCourseInput {
  title: string;
  description?: string | undefined;
  category?: string | undefined;
}

export interface UpdateCourseInput {
  title?: string | undefined;
  description?: string | undefined;
  category?: string | undefined;
  status?: CourseStatus | undefined;
}

/** Domain events the content context emits. Empty placeholder. */
export type ContentEvent = never;
