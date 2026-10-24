// Member resource schemas — the student-facing read surface. Reuses the Course
// and Module payloads (identical wire shape to the back-office API, including
// the opaque activity `settings` blob) so one renderer path serves both.
import { z } from 'zod';
import { progressReportItemSchema } from '@headless-lms/core/schemas';
import { Course } from './content.js';
import { Module } from './activities.js';
import { Download, DownloadFile } from './downloads.js';
import { OrgRole } from './shared.js';

/** Courses the authenticated student is actively enrolled in (published only). */
export const MemberCourses = z.array(Course);
export type MemberCourses = z.infer<typeof MemberCourses>;

/** One enrolled course's module→activity tree (published activities only). */
export const MemberModules = z.array(Module);
export type MemberModules = z.infer<typeof MemberModules>;

export const MemberCourseIdParam = z.object({ courseId: z.string() });
export type MemberCourseIdParam = z.infer<typeof MemberCourseIdParam>;

/** Downloads the authenticated student is actively entitled to (published only). */
export const MemberDownloads = z.array(Download);
export type MemberDownloads = z.infer<typeof MemberDownloads>;

/** One entitled download plus its ordered assets. */
export const MemberDownload = z.object({
  download: Download,
  assets: z.array(DownloadFile),
});
export type MemberDownload = z.infer<typeof MemberDownload>;

/** The portal org's public identity — the student surface themes against it. */
export const MemberOrg = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});
export type MemberOrg = z.infer<typeof MemberOrg>;

/** Who the caller is within the session's org. The session cookie identifies
 *  an auth user; the learner surface is keyed on `org_users.id`. */
export const MemberViewer = z.object({
  orgUserId: z.string(),
  role: OrgRole,
});
export type MemberViewer = z.infer<typeof MemberViewer>;

/** One reported fact — never a decision. `asset` names the subject within the
 *  activity (absent = the activity itself); `completed` is the learner's
 *  activity-level claim. Every other field is the asset type's own vocabulary,
 *  passed through opaquely. */
export const ProgressReportItem = progressReportItemSchema;
export type ProgressReportItem = z.infer<typeof ProgressReportItem>;

/** The report envelope: the target (key names the content type) and a batch of
 *  items. `[]` is a bare touch — it creates the record. */
export const ReportProgress = z.object({
  activity: z.string(),
  reports: z.array(ProgressReportItem),
});
export type ReportProgress = z.infer<typeof ReportProgress>;

/** The reported target's state after the service decided. */
export const ProgressStatus = z.object({
  status: z.enum(['in-progress', 'completed']),
});
export type ProgressStatus = z.infer<typeof ProgressStatus>;

/** Per-course progress, derived on read against current structure. */
export const CourseProgress = z.object({
  /** Keyed by activity id; absent key = not started. */
  activities: z.record(z.string(), z.enum(['in-progress', 'completed'])),
  /** Integer 0–100, completed ÷ current activities, rounded. */
  percent: z.int().min(0).max(100),
  completed: z.boolean(),
  /** Keyed by activity id: the per-asset reported state map (opaque). */
  positions: z.record(z.string(), z.unknown()),
});
export type CourseProgress = z.infer<typeof CourseProgress>;
