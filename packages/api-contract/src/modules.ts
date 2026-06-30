// Course modules + items (lessons and assessments) resource schemas.
// A module holds an ordered list of module items; each item is a link placing
// one lesson OR one assessment at a position (`seq`) and embeds the resolved
// content entity.
import { z } from "zod";

export const LessonType = z.enum(["video", "text", "pdf", "audio", "download", "embed"]);
export type LessonType = z.infer<typeof LessonType>;

export const AssessmentType = z.enum(["quiz", "assignment"]);
export type AssessmentType = z.infer<typeof AssessmentType>;

// Content entities.
export const Lesson = z.object({
  id: z.string(),
  type: LessonType,
  title: z.string(),
  // Opaque per-lesson blob (content payload + completion rule + settings).
  settings: z.unknown(),
  assetIds: z.array(z.string()),
});
export type Lesson = z.infer<typeof Lesson>;

export const Assessment = z.object({
  id: z.string(),
  type: AssessmentType,
  title: z.string(),
  published: z.boolean(),
  questionCount: z.number().int().optional(),
  pointsPossible: z.number().int().optional(),
});
export type Assessment = z.infer<typeof Assessment>;

// Module item: an orderable link to a lesson or an assessment, embedding it.
export const LessonItem = z.object({
  id: z.string(),
  moduleId: z.string(),
  seq: z.number().int(),
  kind: z.literal("lesson"),
  lessonId: z.string(),
  lesson: Lesson,
});

export const AssessmentItem = z.object({
  id: z.string(),
  moduleId: z.string(),
  seq: z.number().int(),
  kind: z.literal("assessment"),
  assessmentId: z.string(),
  assessment: Assessment,
});

export const ModuleItem = z.discriminatedUnion("kind", [LessonItem, AssessmentItem]);
export type ModuleItem = z.infer<typeof ModuleItem>;

export const Module = z.object({
  id: z.string(),
  courseId: z.string(),
  title: z.string(),
  seq: z.number().int(),
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
  settings: z.unknown().optional(),
  assetIds: z.array(z.string()).optional(),
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
