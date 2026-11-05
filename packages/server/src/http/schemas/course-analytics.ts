// Per-course analytics resource schemas.
import type { CourseLearner as DomainCourseLearner } from '@headless-lms/core/reporting/admin';
import { z } from 'zod';
import { OrgUserProfileSchema, PageQuery, paginated, type Matches } from './shared.js';

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

export const CourseLearner = OrgUserProfileSchema.extend({
  status: z
    .enum(['active', 'expired', 'revoked'])
    .describe('The status of the grant that opens the course to them.'),
  source: z.string().describe('Where the grant came from.'),
  grantedAt: z.string(),
  expiresAt: z.string().nullable(),
  totalActivities: z.number().int().describe('Published activities in the course.'),
  completedActivities: z.number().int(),
  progress: z.number().int().describe('Completed published activities over the total, 0–100.'),
  lastActivityAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});
type _CourseLearnerMatches = Matches<DomainCourseLearner, z.infer<typeof CourseLearner>> &
  Matches<z.infer<typeof CourseLearner>, DomainCourseLearner>;
export const CourseLearnersQuery = PageQuery.extend({ search: z.string().trim().optional() });
export const CourseLearnersPage = paginated(CourseLearner);
