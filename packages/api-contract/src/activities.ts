// Course modules + activities resource schemas. A module holds an ordered list
// of activities directly; each activity is a uniform, orderable unit placing an
// opaque settings blob at a position (`seq`) with a set of linked assets.
import { z } from "zod";

// Activity: a uniform, orderable unit within a module. `settings` is an opaque
// per-activity blob; `assetIds` links the activity to its assets.
export const Activity = z.object({
  id: z.string(),
  moduleId: z.string(),
  seq: z.number().int(),
  settings: z.unknown(),
  assetIds: z.array(z.string()),
});
export type Activity = z.infer<typeof Activity>;

export const Module = z.object({
  id: z.string(),
  courseId: z.string(),
  title: z.string(),
  seq: z.number().int(),
  activities: z.array(Activity),
});
export type Module = z.infer<typeof Module>;

/** Module/activity-write endpoints return the full, reordered module list. */
export const ModuleList = z.array(Module);
export type ModuleList = z.infer<typeof ModuleList>;

export const CourseIdPathParam = z.object({ courseId: z.string() });
export type CourseIdPathParam = z.infer<typeof CourseIdPathParam>;

export const ModulePathParam = z.object({ courseId: z.string(), moduleId: z.string() });
export type ModulePathParam = z.infer<typeof ModulePathParam>;

export const ActivityPathParam = z.object({
  courseId: z.string(),
  moduleId: z.string(),
  activityId: z.string(),
});
export type ActivityPathParam = z.infer<typeof ActivityPathParam>;

export const CreateModule = z.object({ title: z.string().min(1) });
export type CreateModule = z.infer<typeof CreateModule>;

export const UpdateModule = z.object({ title: z.string().min(1) });
export type UpdateModule = z.infer<typeof UpdateModule>;

export const ReorderInput = z.object({ orderedIds: z.array(z.string()) });
export type ReorderInput = z.infer<typeof ReorderInput>;

/** Create/update an activity within a module. */
export const SaveActivity = z.object({
  settings: z.unknown().optional(),
  assetIds: z.array(z.string()).optional(),
});
export type SaveActivity = z.infer<typeof SaveActivity>;
