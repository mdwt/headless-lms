// Course modules + items (lessons and assessments) resource schemas.
import { z } from "zod";

export const LessonType = z.enum(["video", "text", "pdf", "audio", "download", "embed"]);
export type LessonType = z.infer<typeof LessonType>;

export const AssessmentType = z.enum(["quiz", "assignment"]);
export type AssessmentType = z.infer<typeof AssessmentType>;

export const Lesson = z.object({
  id: z.string(),
  moduleId: z.string(),
  kind: z.literal("lesson"),
  title: z.string(),
  order: z.number().int(),
  type: LessonType,
  durationLabel: z.string().optional(),
  /** Media-library asset backing this lesson (video file, downloadable, …). */
  assetId: z.string().optional(),
  published: z.boolean(),
});
export type Lesson = z.infer<typeof Lesson>;

export const Assessment = z.object({
  id: z.string(),
  moduleId: z.string(),
  kind: z.literal("assessment"),
  title: z.string(),
  order: z.number().int(),
  type: AssessmentType,
  questionCount: z.number().int().optional(),
  pointsPossible: z.number().int().optional(),
  published: z.boolean(),
});
export type Assessment = z.infer<typeof Assessment>;

export const ModuleItem = z.discriminatedUnion("kind", [Lesson, Assessment]);
export type ModuleItem = z.infer<typeof ModuleItem>;

export const Module = z.object({
  id: z.string(),
  courseId: z.string(),
  title: z.string(),
  order: z.number().int(),
  items: z.array(ModuleItem),
});
export type Module = z.infer<typeof Module>;

/** Module-write endpoints return the full, reordered module list for the course. */
export const ModuleList = z.array(Module);
export type ModuleList = z.infer<typeof ModuleList>;

export const CourseIdPathParam = z.object({ courseId: z.string() });
export type CourseIdPathParam = z.infer<typeof CourseIdPathParam>;

export const ModulePathParam = z.object({ courseId: z.string(), moduleId: z.string() });
export type ModulePathParam = z.infer<typeof ModulePathParam>;

export const ItemPathParam = z.object({
  courseId: z.string(),
  moduleId: z.string(),
  itemId: z.string(),
});
export type ItemPathParam = z.infer<typeof ItemPathParam>;

export const CreateModule = z.object({ title: z.string().min(1) });
export type CreateModule = z.infer<typeof CreateModule>;

export const UpdateModule = z.object({ title: z.string().min(1) });
export type UpdateModule = z.infer<typeof UpdateModule>;

export const ReorderInput = z.object({ orderedIds: z.array(z.string()) });
export type ReorderInput = z.infer<typeof ReorderInput>;

/** Create/update a lesson or assessment within a module. */
export const SaveLesson = z.object({
  kind: z.literal("lesson"),
  title: z.string().min(1),
  type: LessonType,
  durationLabel: z.string().optional(),
  assetId: z.string().optional(),
  published: z.boolean().optional(),
});
export const SaveAssessment = z.object({
  kind: z.literal("assessment"),
  title: z.string().min(1),
  type: AssessmentType,
  questionCount: z.number().int().optional(),
  pointsPossible: z.number().int().optional(),
  published: z.boolean().optional(),
});
export const SaveItem = z.discriminatedUnion("kind", [SaveLesson, SaveAssessment]);
export type SaveItem = z.infer<typeof SaveItem>;
