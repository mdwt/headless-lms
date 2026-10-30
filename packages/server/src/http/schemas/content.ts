// Content resource schemas (courses). The Course payload shape is owned by
// @headless-lms/core/schemas; route-local schemas define endpoint-only
// concerns such as defaults, params, and pagination envelopes.
import { z } from 'zod';
import {
  courseSettingsSchema,
  courseStatusSchema,
  courseViewSchema,
  idSchema,
} from '@headless-lms/core/schemas';
import { ListQuery, paginated } from './shared.js';

export const CourseStatus = courseStatusSchema;
export type CourseStatus = z.infer<typeof CourseStatus>;

export const CourseSettings = courseSettingsSchema;
export type CourseSettings = z.infer<typeof CourseSettings>;

export const PatchCourseSettings = CourseSettings.partial();
export type PatchCourseSettings = z.infer<typeof PatchCourseSettings>;

export const Course = courseViewSchema;
export type Course = z.infer<typeof Course>;

export const CreateCourse = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5_000).default(''),
  category: z.string().trim().max(100).default(''),
});
export type CreateCourse = z.infer<typeof CreateCourse>;

export const UpdateCourse = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5_000).optional(),
  category: z.string().trim().max(100).optional(),
  status: CourseStatus.optional(),
  /** null clears the cover. */
  thumbnailAssetId: idSchema.nullable().optional(),
});
export type UpdateCourse = z.infer<typeof UpdateCourse>;

export const CoursesQuery = ListQuery.extend({
  status: CourseStatus.optional(),
  category: z.string().trim().max(100).optional(),
});
export type CoursesQuery = z.infer<typeof CoursesQuery>;

export const CoursesPage = paginated(Course);
export type CoursesPage = z.infer<typeof CoursesPage>;

export const CourseIdParam = z.object({ id: z.string() });
export type CourseIdParam = z.infer<typeof CourseIdParam>;
