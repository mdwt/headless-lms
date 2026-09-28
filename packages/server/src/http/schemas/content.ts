// Content resource schemas (courses). The Course payload shape is owned by
// @headless-lms/core/schemas; route-local schemas define endpoint-only
// concerns such as defaults, params, and pagination envelopes.
import { z } from 'zod';
import { courseSchema, courseSettingsSchema, courseStatusSchema } from '@headless-lms/core/schemas';
import { ListQuery, paginated } from './shared.js';

export const CourseStatus = courseStatusSchema;
export type CourseStatus = z.infer<typeof CourseStatus>;

export const CourseSettings = courseSettingsSchema;
export type CourseSettings = z.infer<typeof CourseSettings>;

export const PatchCourseSettings = CourseSettings.partial();
export type PatchCourseSettings = z.infer<typeof PatchCourseSettings>;

export const Course = courseSchema;
export type Course = z.infer<typeof Course>;

export const CreateCourse = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  category: z.string().default(''),
});
export type CreateCourse = z.infer<typeof CreateCourse>;

export const UpdateCourse = CreateCourse.partial().extend({
  status: CourseStatus.optional(),
  /** null clears the cover. */
  thumbnailAssetId: z.string().nullable().optional(),
});
export type UpdateCourse = z.infer<typeof UpdateCourse>;

export const CoursesQuery = ListQuery.extend({
  status: CourseStatus.optional(),
  category: z.string().optional(),
});
export type CoursesQuery = z.infer<typeof CoursesQuery>;

export const CoursesPage = paginated(Course);
export type CoursesPage = z.infer<typeof CoursesPage>;

export const CourseIdParam = z.object({ id: z.string() });
export type CourseIdParam = z.infer<typeof CourseIdParam>;
