// Automations resource schemas. An automation matches a trigger (a domain
// event type) against enabled rules and runs an ordered list of actions;
// every run is recorded. The single source of truth for the payloads the
// Fastify routes validate requests/responses against, the OpenAPI spec is
// built from, and the frontend SDK is generated off.
import { z } from "zod";
import { ListQuery, paginated } from "./shared.js";

/** One step of an automation: which action, and its input per that action's inputSchema. */
export const AutomationAction = z.object({
  type: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
});
export type AutomationAction = z.infer<typeof AutomationAction>;

/** A domain event type, e.g. `entitlement.created`. */
export const AutomationTrigger = z.string();
export type AutomationTrigger = z.infer<typeof AutomationTrigger>;

export const Automation = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  trigger: AutomationTrigger,
  actions: z.array(AutomationAction),
  enabled: z.boolean(),
});
export type Automation = z.infer<typeof Automation>;

export const CreateAutomationBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  trigger: AutomationTrigger,
  actions: z.array(AutomationAction),
});
export type CreateAutomationBody = z.infer<typeof CreateAutomationBody>;

export const UpdateAutomationBody = CreateAutomationBody.partial().extend({
  enabled: z.boolean().optional(),
});
export type UpdateAutomationBody = z.infer<typeof UpdateAutomationBody>;

export const AutomationIdParam = z.object({ id: z.string() });
export type AutomationIdParam = z.infer<typeof AutomationIdParam>;

/** An action an automation can use: a built-in type (`sendEmail`) or a loaded
 *  integration's own (`<integrationId>.<actionId>`). */
export const AvailableAction = z.object({
  type: z.string(),
  description: z.string(),
  inputSchema: z.record(z.string(), z.unknown()),
  /** Who defines it: `system` or the integration id. */
  source: z.string(),
});
export type AvailableAction = z.infer<typeof AvailableAction>;

/** Which domain events an automation can react to. */
export const AvailableTriggers = z.object({
  triggers: z.array(z.object({ type: z.string(), description: z.string() })),
});
export type AvailableTriggers = z.infer<typeof AvailableTriggers>;

export const AutomationRunStatus = z.enum(["running", "completed", "failed"]);
export type AutomationRunStatus = z.infer<typeof AutomationRunStatus>;

export const AutomationActionResult = z.object({
  index: z.number().int(),
  type: z.string(),
  status: z.enum(["completed", "failed"]),
  error: z.string().optional(),
});
export type AutomationActionResult = z.infer<typeof AutomationActionResult>;

export const AutomationRun = z.object({
  id: z.string(),
  orgId: z.string(),
  automationId: z.string(),
  trigger: AutomationTrigger,
  /** The triggering event snapshot (a DomainEvent — free-form beyond its
   *  common `type`/`id`/`orgId`/`createdAt` fields). */
  event: z.record(z.string(), z.unknown()),
  status: AutomationRunStatus,
  actionResults: z.array(AutomationActionResult),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type AutomationRun = z.infer<typeof AutomationRun>;

export const AutomationRunsQuery = ListQuery.extend({
  status: AutomationRunStatus.optional(),
});
export type AutomationRunsQuery = z.infer<typeof AutomationRunsQuery>;

export const AutomationRunsPage = paginated(AutomationRun);
export type AutomationRunsPage = z.infer<typeof AutomationRunsPage>;
