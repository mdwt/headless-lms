// Automations resource schemas. An automation matches a trigger (a domain
// event type) against enabled rules and runs an ordered list of actions;
// every run is recorded. Payload shapes are owned by
// @headless-lms/core/schemas; route-local schemas define endpoint-only
// concerns such as params and pagination envelopes.
import { z } from 'zod';
import {
  automationActionResultSchema,
  automationActionSchema,
  automationKindSchema,
  automationRunSchema,
  automationRunStatusSchema,
  automationSchema,
  automationTriggerSchema,
  automationsQuerySchema,
  availableActionSchema,
  availableTriggersSchema,
  createAutomationInputSchema,
  createdWebhookSchema,
  createWebhookInputSchema,
  updateAutomationInputSchema,
  updateWebhookInputSchema,
  webhookSchema,
  webhookSecretSchema,
} from '@headless-lms/core/schemas';
import { ListQuery, paginated } from './shared.js';

/** One step of an automation: which action, and its input per that action's inputSchema. */
export const AutomationAction = automationActionSchema;
export type AutomationAction = z.infer<typeof AutomationAction>;

/** A domain event type, e.g. `entitlement.created`. */
export const AutomationTrigger = automationTriggerSchema;
export type AutomationTrigger = z.infer<typeof AutomationTrigger>;

export const AutomationKind = automationKindSchema;
export type AutomationKind = z.infer<typeof AutomationKind>;

export const Automation = automationSchema;
export type Automation = z.infer<typeof Automation>;

export const AutomationsQuery = automationsQuerySchema;
export type AutomationsQuery = z.infer<typeof AutomationsQuery>;

export const CreateAutomationBody = createAutomationInputSchema;
export type CreateAutomationBody = z.infer<typeof CreateAutomationBody>;

export const UpdateAutomationBody = updateAutomationInputSchema;
export type UpdateAutomationBody = z.infer<typeof UpdateAutomationBody>;

export const AutomationIdParam = z.object({ id: z.string() });
export type AutomationIdParam = z.infer<typeof AutomationIdParam>;

export const AutomationRunParams = z.object({ id: z.string(), runId: z.string() });
export type AutomationRunParams = z.infer<typeof AutomationRunParams>;

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

export const Webhook = webhookSchema;
export type Webhook = z.infer<typeof Webhook>;

export const CreatedWebhook = createdWebhookSchema;
export type CreatedWebhook = z.infer<typeof CreatedWebhook>;

export const CreateWebhookBody = createWebhookInputSchema;
export type CreateWebhookBody = z.infer<typeof CreateWebhookBody>;

export const UpdateWebhookBody = updateWebhookInputSchema;
export type UpdateWebhookBody = z.infer<typeof UpdateWebhookBody>;

export const WebhookSecret = webhookSecretSchema;
export type WebhookSecret = z.infer<typeof WebhookSecret>;
