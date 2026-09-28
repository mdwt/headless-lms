// Per-course analytics resource schemas.
import { z } from 'zod';

export const CourseActivityEngagement = z.object({
  activityId: z.string(),
  title: z.string(),
  moduleId: z.string(),
  moduleTitle: z.string(),
  started: z.number().int(),
  completed: z.number().int(),
});
export type CourseActivityEngagement = z.infer<typeof CourseActivityEngagement>;

export const CourseAnalytics = z.object({
  enrolled: z.number().int(),
  started: z.number().int(),
  completed: z.number().int(),
  avgProgress: z.number().int(),
  activities: z.array(CourseActivityEngagement),
});
export type CourseAnalytics = z.infer<typeof CourseAnalytics>;
