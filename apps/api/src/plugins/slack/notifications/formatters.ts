// slack integration — pure formatters: one per event type, dispatched by the
// discriminator. `text` is the notification-fallback string; `blocks` is the
// Block Kit layout. No transport concerns here — easy to unit-test.
import type { EnrollmentEventPayload, EventNotification } from "./schema.js";

export interface SlackMessage {
  text: string;
  blocks: unknown[];
}

function studentName(e: EnrollmentEventPayload): string {
  return `${e.firstName} ${e.lastName}`;
}

function header(title: string): unknown {
  return { type: "header", text: { type: "plain_text", text: title, emoji: true } };
}

function field(label: string, value: string): { type: "mrkdwn"; text: string } {
  return { type: "mrkdwn", text: `*${label}*\n${value}` };
}

function enrollmentFields(e: EnrollmentEventPayload): unknown {
  const fields = [
    field("Student", studentName(e)),
    field("Email", e.studentEmail),
    field("Course", e.courseTitle),
    field("Enrolled at", e.grantedAt),
  ];
  if (e.expiresAt) fields.push(field("Expires", e.expiresAt));
  return { type: "section", fields };
}

function context(text: string): unknown {
  return { type: "context", elements: [{ type: "mrkdwn", text }] };
}

type Formatter<T extends EventNotification["type"]> = (
  event: Extract<EventNotification, { type: T }>,
) => SlackMessage;

const formatGranted: Formatter<"entitlement.granted"> = ({ entitlement: e }) => ({
  text: `✅ ${studentName(e)} enrolled in ${e.courseTitle}`,
  blocks: [
    header("✅ New enrollment"),
    enrollmentFields(e),
    context(`Enrolled ${e.grantedAt}`),
  ],
});

const formatRevoked: Formatter<"entitlement.revoked"> = ({ entitlement: e }) => ({
  text: `🚫 ${studentName(e)}'s enrollment in ${e.courseTitle} was revoked`,
  blocks: [
    header("🚫 Enrollment revoked"),
    enrollmentFields(e),
    context(`Originally enrolled ${e.grantedAt}`),
  ],
});

const formatExpired: Formatter<"entitlement.expired"> = ({ entitlement: e }) => ({
  text: `⏳ ${studentName(e)}'s access to ${e.courseTitle} has expired`,
  blocks: [
    header("⏳ Enrollment expired"),
    enrollmentFields(e),
    context(`Originally enrolled ${e.grantedAt}`),
  ],
});

const formatters = {
  "entitlement.granted": formatGranted,
  "entitlement.revoked": formatRevoked,
  "entitlement.expired": formatExpired,
} satisfies { [T in EventNotification["type"]]: Formatter<T> };

export function formatNotification(event: EventNotification): SlackMessage {
  return (formatters[event.type] as (e: EventNotification) => SlackMessage)(event);
}
