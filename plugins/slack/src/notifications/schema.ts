// slack integration — input contract for posting domain events. The body is
// any domain event: a required `type` plus whatever metadata the event
// carries (unknown keys pass through). Known event types get rich formatting
// (see formatters.ts); anything else falls back to a generic post, so new
// domain events work immediately and earn a bespoke formatter later.
import { z } from "zod";

export const EventBody = z
  .looseObject({
    type: z.string().min(1).describe('Domain event type, e.g. "entitlement.created".'),
  })
  .describe("A domain event: its type plus the metadata the event carries.");
export type EventBody = z.infer<typeof EventBody>;

/** The content reference an entitlement carries: identity + display name. */
export const ContentRefPayload = z.object({
  id: z.string(),
  type: z.string().describe('Content type, e.g. "course".'),
  title: z.string(),
});
export type ContentRefPayload = z.infer<typeof ContentRefPayload>;

/** The metadata entitlement.* events carry (mirrors the domain event snapshot). */
export const EntitlementEventPayload = z.object({
  id: z.string().optional(),
  firstName: z.string(),
  lastName: z.string(),
  studentEmail: z.string(),
  content: ContentRefPayload,
  grantedAt: z.string().describe("ISO-8601 timestamp"),
  expiresAt: z.string().nullable().optional().describe("ISO-8601 timestamp, if access expires"),
});
export type EntitlementEventPayload = z.infer<typeof EntitlementEventPayload>;

/** Validates an entitlement.* body's metadata before rich formatting. */
export const EntitlementEventBody = z.looseObject({ entitlement: EntitlementEventPayload });
