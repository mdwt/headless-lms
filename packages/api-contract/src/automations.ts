// Automations resource schemas. An automation matches a trigger (a domain
// event type) against enabled rules and runs an ordered list of actions;
// every run is recorded. The single source of truth for the payloads the
// Fastify routes validate requests/responses against, the OpenAPI spec is
// built from, and the frontend SDK is generated off.
import { z } from "zod";
import { ListQuery, paginated } from "./shared.js";

/** Every EmailTemplateId — see @headless-lms/types/email-templates.ts. */
export const EmailTemplateId = z.enum([
  "magicLink",
  "studentInvite",
  "memberInvite",
  "passwordReset",
  "emailVerification",
  "accessGranted",
  "accessRevoked",
  "courseCompleted",
]);
export type EmailTemplateId = z.infer<typeof EmailTemplateId>;

export const AutomationAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sendEmail"), template: EmailTemplateId }),
]);
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

/** What an automation can be built from: code-owned triggers/actions plus
 *  every loaded integration's own actions. */
export const AutomationsAvailable = z.object({
  triggers: z.array(z.object({ type: z.string(), description: z.string() })),
  actions: z.array(
    z.object({
      type: z.literal("sendEmail"),
      description: z.string(),
      config: z.record(z.string(), z.unknown()),
      validTemplatesByTrigger: z.record(z.string(), z.array(EmailTemplateId)),
    }),
  ),
  integrations: z.array(
    z.object({
      id: z.string(),
      actions: z.array(
        z.object({
          id: z.string(),
          description: z.string(),
          inputSchema: z.record(z.string(), z.unknown()),
          outputSchema: z.record(z.string(), z.unknown()),
        }),
      ),
    }),
  ),
});
export type AutomationsAvailable = z.infer<typeof AutomationsAvailable>;

export const AutomationRunStatus = z.enum(["running", "completed", "failed"]);
export type AutomationRunStatus = z.infer<typeof AutomationRunStatus>;

export const AutomationActionResult = z.object({
  index: z.number().int(),
  type: z.literal("sendEmail"),
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
