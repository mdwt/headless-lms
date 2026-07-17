// slack integration — formats a domain event into a Slack message: switch on
// the event type, format accordingly. `text` is the notification-fallback
// string; `blocks` is the Block Kit layout. Unknown event types get a generic
// post of the event's metadata rather than an error.
import { EnrollmentEventBody, type EnrollmentEventPayload, type EventBody } from "./schema.js";

export interface SlackMessage {
  text: string;
  blocks: unknown[];
}

export function formatMessage(body: EventBody): SlackMessage {
  switch (body.type) {
    case "enrollment.created":
      return formatEnrollmentCreated(enrollment(body));
    case "enrollment.updated":
      return formatEnrollmentUpdated(enrollment(body));
    case "enrollment.deleted":
      return formatEnrollmentDeleted(enrollment(body));
    case "enrollment.expired":
      return formatEnrollmentExpired(enrollment(body));
    default:
      return formatGeneric(body);
  }
}

// Throws (zod) when an enrollment.* body is missing/malformed metadata.
function enrollment(body: EventBody): EnrollmentEventPayload {
  return EnrollmentEventBody.parse(body).enrollment;
}

function formatEnrollmentCreated(e: EnrollmentEventPayload): SlackMessage {
  return {
    text: `✅ ${studentName(e)} enrolled in ${e.courseTitle}`,
    blocks: [header("✅ New enrollment"), enrollmentFields(e), context(`Enrolled ${e.grantedAt}`)],
  };
}

function formatEnrollmentUpdated(e: EnrollmentEventPayload): SlackMessage {
  return {
    text: `🔄 ${studentName(e)}'s enrollment in ${e.courseTitle} was updated`,
    blocks: [
      header("🔄 Enrollment updated"),
      enrollmentFields(e),
      context(`Originally enrolled ${e.grantedAt}`),
    ],
  };
}

function formatEnrollmentDeleted(e: EnrollmentEventPayload): SlackMessage {
  return {
    text: `🚫 ${studentName(e)} was unenrolled from ${e.courseTitle}`,
    blocks: [
      header("🚫 Enrollment removed"),
      enrollmentFields(e),
      context(`Originally enrolled ${e.grantedAt}`),
    ],
  };
}

function formatEnrollmentExpired(e: EnrollmentEventPayload): SlackMessage {
  return {
    text: `⏳ ${studentName(e)}'s access to ${e.courseTitle} has expired`,
    blocks: [
      header("⏳ Enrollment expired"),
      enrollmentFields(e),
      context(`Originally enrolled ${e.grantedAt}`),
    ],
  };
}

// Fallback for event types without a bespoke formatter: post the type and the
// event's metadata as a code block (truncated to stay inside Slack's 3000-char
// section limit).
function formatGeneric(body: EventBody): SlackMessage {
  const { type, ...data } = body;
  const json = JSON.stringify(data, null, 2) ?? "{}";
  const truncated = json.length > 2800 ? `${json.slice(0, 2800)}\n…` : json;
  return {
    text: `📣 ${type}`,
    blocks: [
      header(`📣 ${type}`),
      { type: "section", text: { type: "mrkdwn", text: `\`\`\`${truncated}\`\`\`` } },
    ],
  };
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
