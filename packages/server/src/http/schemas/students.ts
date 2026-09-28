// Students resource schemas.
import { z } from 'zod';
import { emailSchema } from '@headless-lms/core/schemas';
import { ListQuery, paginated, OrgUserProfileSchema } from './shared.js';

export const OrgUserStatus = z.enum(['invited', 'active']);
export type OrgUserStatus = z.infer<typeof OrgUserStatus>;

export const Student = OrgUserProfileSchema.extend({
  entitlementCount: z.number().int(),
  /** 0–100, averaged across active entitlements. */
  avgProgress: z.number().int(),
  /** `invited` means an admin added them and they have not accepted yet. */
  status: OrgUserStatus,
  joinedAt: z.string(),
  lastActiveAt: z.string().nullable(),
});
export type Student = z.infer<typeof Student>;

export const StudentCourseProgress = z.object({
  courseId: z.string(),
  title: z.string(),
  totalActivities: z.number().int(),
  completedActivities: z.number().int(),
  /** 0–100, completed published activities over the course's total. */
  progress: z.number().int(),
  startedAt: z.string().nullable(),
  lastActivityAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type StudentCourseProgress = z.infer<typeof StudentCourseProgress>;

export const StudentAnalytics = z.object({
  enrolled: z.number().int(),
  started: z.number().int(),
  completed: z.number().int(),
  avgProgress: z.number().int(),
  courses: z.array(StudentCourseProgress),
});
export type StudentAnalytics = z.infer<typeof StudentAnalytics>;

export const StudentsQuery = ListQuery;
export type StudentsQuery = z.infer<typeof StudentsQuery>;

export const StudentsPage = paginated(Student);
export type StudentsPage = z.infer<typeof StudentsPage>;

export const StudentIdParam = z.object({ id: z.string() });
export type StudentIdParam = z.infer<typeof StudentIdParam>;

// Every field is a correction to what an admin typed, so all three are sent
// together — the form edits the whole profile, not one attribute at a time.
export const UpdateStudentBody = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: emailSchema,
});
export type UpdateStudentBody = z.infer<typeof UpdateStudentBody>;
