// slack integration — the plugin's own input contract for domain-event
// notifications. Type strings mirror the platform's domain events verbatim so
// a future automations bridge can pass an event straight through (zod strips
// unknown keys such as orgId). The producing contexts own the domain events;
// this plugin owns only what it needs to format a post.
import { z } from "zod";

export const EnrollmentEventPayload = z.object({
  entitlementId: z.string().optional(),
  firstName: z.string(),
  lastName: z.string(),
  studentEmail: z.string(),
  courseId: z.string().optional(),
  courseTitle: z.string(),
  grantedAt: z.string().describe("ISO-8601 timestamp"),
  expiresAt: z.string().nullable().optional().describe("ISO-8601 timestamp, if access expires"),
});
export type EnrollmentEventPayload = z.infer<typeof EnrollmentEventPayload>;

export const EventNotification = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("enrollment.created"), enrollment: EnrollmentEventPayload }),
    z.object({ type: z.literal("enrollment.updated"), enrollment: EnrollmentEventPayload }),
    z.object({ type: z.literal("enrollment.deleted"), enrollment: EnrollmentEventPayload }),
    z.object({ type: z.literal("enrollment.expired"), enrollment: EnrollmentEventPayload }),
  ])
  .describe("A domain event to announce. Type strings mirror the platform's domain events.");
export type EventNotification = z.infer<typeof EventNotification>;
