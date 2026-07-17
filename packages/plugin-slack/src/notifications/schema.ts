// slack integration — input contract for posting domain events. The body is
// any domain event: a required `type` plus whatever metadata the event
// carries (unknown keys pass through). Known event types get rich formatting
// (see formatters.ts); anything else falls back to a generic post, so new
// domain events work immediately and earn a bespoke formatter later.
import { z } from "zod";

export const EventBody = z
  .looseObject({
    type: z.string().min(1).describe('Domain event type, e.g. "enrollment.created".'),
  })
  .describe("A domain event: its type plus the metadata the event carries.");
export type EventBody = z.infer<typeof EventBody>;

/** The metadata enrollment.* events carry (mirrors the domain event snapshot). */
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

/** Validates an enrollment.* body's metadata before rich formatting. */
export const EnrollmentEventBody = z.looseObject({ enrollment: EnrollmentEventPayload });
