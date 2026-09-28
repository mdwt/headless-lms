import { z } from 'zod';
import { idSchema, jsonValueSchema } from './shared.js';

export const progressTargetTypeSchema = z.enum(['activity', 'module', 'course']);
export type ProgressTargetType = z.infer<typeof progressTargetTypeSchema>;

export const progressRecordSchema = z
  .object({
    id: idSchema,
    orgId: idSchema,
    orgUserId: idSchema,
    targetType: progressTargetTypeSchema,
    targetId: idSchema,
    startedAt: z.coerce.date(),
    position: jsonValueSchema.nullable(),
    completedAt: z.coerce.date().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type ProgressRecord = z.output<typeof progressRecordSchema>;
export type ProgressRecordInput = z.input<typeof progressRecordSchema>;

export const progressTargetSchema = z
  .object({
    orgUserId: idSchema,
    targetType: progressTargetTypeSchema,
    targetId: idSchema,
  })
  .strict();
export type ProgressTarget = z.infer<typeof progressTargetSchema>;

export const progressReportItemSchema = z
  .object({
    asset: z.string().optional(),
    completed: z.boolean().optional(),
  })
  .catchall(jsonValueSchema);
export type ProgressReportItem = z.infer<typeof progressReportItemSchema>;

export const reportProgressInputSchema = z
  .object({
    orgUserId: idSchema,
    activityId: idSchema,
    reports: z.array(progressReportItemSchema),
  })
  .strict();
export type ReportProgressInput = z.infer<typeof reportProgressInputSchema>;
