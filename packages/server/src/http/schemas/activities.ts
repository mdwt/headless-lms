// Course modules + activities resource schemas. A module holds an ordered list
// of activities directly; each activity is a uniform, orderable unit placing an
// opaque settings blob at a position (`seq`) with a set of linked assets.
import { z } from 'zod';
import {
  activityAssetSchema,
  activitySchema,
  moduleSchema,
  saveActivityInputSchema,
} from '@headless-lms/core/schemas';

export const Activity = activitySchema;
export type Activity = z.infer<typeof Activity>;

export const ActivityAsset = activityAssetSchema;
export type ActivityAsset = z.infer<typeof ActivityAsset>;

export const Module = moduleSchema;
export type Module = z.infer<typeof Module>;

/** Module/activity-write endpoints return the full, reordered module list. */
export const ModuleList = z.array(Module);
export type ModuleList = z.infer<typeof ModuleList>;

/** A course's activities as bare rows, ordered by (moduleId, seq). */
export const ActivityList = z.array(Activity);
export type ActivityList = z.infer<typeof ActivityList>;

/** A course's activity→asset link rows, ordered by (activityId, seq). */
export const ActivityAssetList = z.array(ActivityAsset);
export type ActivityAssetList = z.infer<typeof ActivityAssetList>;

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

export const SaveActivity = saveActivityInputSchema;
export type SaveActivity = z.infer<typeof SaveActivity>;
