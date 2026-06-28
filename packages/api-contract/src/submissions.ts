// Submissions (grading queue) resource schemas.
import { z } from "zod";
import { ListQuery, paginated } from "./shared.js";

export const SubmissionStatus = z.enum(["pending", "graded", "returned"]);
export type SubmissionStatus = z.infer<typeof SubmissionStatus>;

export const Submission = z.object({
  id: z.string(),
  assessmentId: z.string(),
  assessmentTitle: z.string(),
  courseId: z.string(),
  courseTitle: z.string(),
  studentId: z.string(),
  studentName: z.string(),
  studentEmail: z.string(),
  status: SubmissionStatus,
  submittedAt: z.string(),
  pointsPossible: z.number().int(),
  score: z.number().nullable(),
  feedback: z.string().nullable(),
  responsePreview: z.string(),
});
export type Submission = z.infer<typeof Submission>;

export const SubmissionsQuery = ListQuery.extend({
  status: SubmissionStatus.optional(),
  courseTitle: z.string().optional(),
});
export type SubmissionsQuery = z.infer<typeof SubmissionsQuery>;

export const SubmissionsPage = paginated(Submission);
export type SubmissionsPage = z.infer<typeof SubmissionsPage>;

export const GradeSubmission = z.object({
  score: z.number().int(),
  feedback: z.string(),
});
export type GradeSubmission = z.infer<typeof GradeSubmission>;

export const SubmissionIdParam = z.object({ id: z.string() });
export type SubmissionIdParam = z.infer<typeof SubmissionIdParam>;
