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
