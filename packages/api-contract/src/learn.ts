// Learn resource schemas — the student-facing read surface. Reuses the Course
// and Module payloads (identical wire shape to the back-office API, including
// the opaque activity `settings` blob) so one renderer path serves both.
import { z } from "zod";
import { Course } from "./content.js";
import { Module } from "./activities.js";

/** Courses the authenticated student is actively enrolled in (published only). */
export const LearnCourses = z.array(Course);
export type LearnCourses = z.infer<typeof LearnCourses>;

/** One enrolled course's module→activity tree (published activities only). */
export const LearnModules = z.array(Module);
export type LearnModules = z.infer<typeof LearnModules>;

export const LearnCourseIdParam = z.object({ courseId: z.string() });
export type LearnCourseIdParam = z.infer<typeof LearnCourseIdParam>;

/** The portal org's public identity — the student surface themes against it. */
export const LearnOrg = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});
export type LearnOrg = z.infer<typeof LearnOrg>;

/** One reported fact — never a decision. `asset` names the subject within the
 *  activity (absent = the activity itself); `completed` is the learner's
 *  activity-level claim. Every other field is the asset type's own vocabulary,
 *  passed through opaquely. */
export const ProgressReportItem = z.looseObject({
  asset: z.string().optional(),
  completed: z.boolean().optional(),
});
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
  status: z.enum(["in-progress", "completed"]),
});
export type ProgressStatus = z.infer<typeof ProgressStatus>;

/** Per-course progress, derived on read against current structure. */
export const CourseProgress = z.object({
  /** Keyed by activity id; absent key = not started. */
  activities: z.record(z.string(), z.enum(["in-progress", "completed"])),
  /** Integer 0–100, completed ÷ current activities, rounded. */
  percent: z.int().min(0).max(100),
  completed: z.boolean(),
});
export type CourseProgress = z.infer<typeof CourseProgress>;

