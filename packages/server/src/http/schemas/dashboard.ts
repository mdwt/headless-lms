// Dashboard / overview resource schemas.
import { z } from 'zod';

export const OverviewStats = z.object({
  publishedCourses: z.number().int(),
  draftCourses: z.number().int(),
  activeStudents: z.number().int(),
  expiringSoon: z.number().int(),
});
export type OverviewStats = z.infer<typeof OverviewStats>;

export const EnrollmentPoint = z.object({
  date: z.string(),
  count: z.number().int(),
});
export type EnrollmentPoint = z.infer<typeof EnrollmentPoint>;

export const EnrollmentSeries = z.array(EnrollmentPoint);
export type EnrollmentSeries = z.infer<typeof EnrollmentSeries>;

export const EnrollmentSeriesQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type EnrollmentSeriesQuery = z.infer<typeof EnrollmentSeriesQuery>;
