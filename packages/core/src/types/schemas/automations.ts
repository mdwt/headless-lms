import { z } from 'zod';
import { domainEventSchema, idSchema, jsonRecordSchema } from './shared.js';

export const automationTriggerSchema = z.string().trim().min(1);
export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;

export const automationActionSchema = z
  .object({
    type: z.string().trim().min(1),
    input: jsonRecordSchema,
  })
  .strict();
export type AutomationAction = z.infer<typeof automationActionSchema>;

export const automationSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    name: z.string(),
    description: z.string().nullable(),
    trigger: automationTriggerSchema,
    actions: z.array(automationActionSchema),
    enabled: z.boolean(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Automation = z.output<typeof automationSchema>;
export type AutomationInput = z.input<typeof automationSchema>;

export const createAutomationInputSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    trigger: automationTriggerSchema,
    actions: z.array(automationActionSchema),
  })
  .strict();
export type CreateAutomationInput = z.infer<typeof createAutomationInputSchema>;

export const updateAutomationInputSchema = createAutomationInputSchema.partial().extend({
  enabled: z.boolean().optional(),
});
export type UpdateAutomationInput = z.infer<typeof updateAutomationInputSchema>;

export const automationRunsQuerySchema = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    status: z.enum(['running', 'completed', 'failed']).optional(),
    sort: z.string().optional(),
  })
  .strict();
export type AutomationRunsQuery = z.infer<typeof automationRunsQuerySchema>;

export const automationRunStatusSchema = z.enum(['running', 'completed', 'failed']);
export type AutomationRunStatus = z.infer<typeof automationRunStatusSchema>;

export const automationActionResultSchema = z
  .object({
    index: z.number().int().min(0),
    type: z.string().trim().min(1),
    status: z.enum(['completed', 'failed']),
    error: z.string().optional(),
  })
  .strict();
export type AutomationActionResult = z.infer<typeof automationActionResultSchema>;

export const automationRunSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    automationId: idSchema,
    trigger: automationTriggerSchema,
    eventId: idSchema,
    event: domainEventSchema,
    status: automationRunStatusSchema,
    actionResults: z.array(automationActionResultSchema),
    startedAt: z.coerce.date(),
    finishedAt: z.coerce.date().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type AutomationRun = z.output<typeof automationRunSchema>;
export type AutomationRunInput = z.input<typeof automationRunSchema>;

export const availableActionSchema = z
  .object({
    type: z.string().trim().min(1),
    description: z.string(),
    inputSchema: jsonRecordSchema,
    source: z.string(),
  })
  .strict();
export type AvailableAction = z.infer<typeof availableActionSchema>;
export type AvailableActions = AvailableAction[];

export const availableTriggersSchema = z
  .object({
    triggers: z.array(
      z
        .object({
          type: z.string().trim().min(1),
          label: z.string().min(1),
          category: z.string().min(1),
          description: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
export type AvailableTriggers = z.infer<typeof availableTriggersSchema>;
