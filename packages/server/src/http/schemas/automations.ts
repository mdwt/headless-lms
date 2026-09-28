// Automations resource schemas. An automation matches a trigger (a domain
// event type) against enabled rules and runs an ordered list of actions;
// every run is recorded. Payload shapes are owned by
// @headless-lms/core/schemas; route-local schemas define endpoint-only
// concerns such as params and pagination envelopes.
import { z } from 'zod';
import {
  automationActionResultSchema,
  automationActionSchema,
  automationRunSchema,
  automationRunStatusSchema,
  automationSchema,
  automationTriggerSchema,
  availableActionSchema,
  availableTriggersSchema,
  createAutomationInputSchema,
  updateAutomationInputSchema,
} from '@headless-lms/core/schemas';
import { ListQuery, paginated } from './shared.js';

/** One step of an automation: which action, and its input per that action's inputSchema. */
export const AutomationAction = automationActionSchema;
export type AutomationAction = z.infer<typeof AutomationAction>;

/** A domain event type, e.g. `entitlement.created`. */
export const AutomationTrigger = automationTriggerSchema;
export type AutomationTrigger = z.infer<typeof AutomationTrigger>;

export const Automation = automationSchema;
export type Automation = z.infer<typeof Automation>;

export const CreateAutomationBody = createAutomationInputSchema;
export type CreateAutomationBody = z.infer<typeof CreateAutomationBody>;

export const UpdateAutomationBody = updateAutomationInputSchema;
export type UpdateAutomationBody = z.infer<typeof UpdateAutomationBody>;

export const AutomationIdParam = z.object({ id: z.string() });
export type AutomationIdParam = z.infer<typeof AutomationIdParam>;

/** An action an automation can use: a built-in type (`sendEmail`) or a loaded
 *  integration's own (`<integrationId>.<actionId>`). */
export const AvailableAction = availableActionSchema;
export type AvailableAction = z.infer<typeof AvailableAction>;

/** Which domain events an automation can react to. */
export const AvailableTriggers = availableTriggersSchema;
export type AvailableTriggers = z.infer<typeof AvailableTriggers>;

export const AutomationRunStatus = automationRunStatusSchema;
export type AutomationRunStatus = z.infer<typeof AutomationRunStatus>;

export const AutomationActionResult = automationActionResultSchema;
export type AutomationActionResult = z.infer<typeof AutomationActionResult>;

export const AutomationRun = automationRunSchema;
export type AutomationRun = z.infer<typeof AutomationRun>;

export const AutomationRunsQuery = ListQuery.extend({
  status: AutomationRunStatus.optional(),
});
export type AutomationRunsQuery = z.infer<typeof AutomationRunsQuery>;

export const AutomationRunsPage = paginated(AutomationRun);
export type AutomationRunsPage = z.infer<typeof AutomationRunsPage>;
