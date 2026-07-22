// slack integration — formats a domain event into a Slack message: switch on
// the event type, format accordingly. `text` is the notification-fallback
// string; `blocks` is the Block Kit layout. Unknown event types get a generic
// post of the event's metadata rather than an error.
import { EntitlementEventBody, type EntitlementEventPayload, type EventBody } from "./schema.js";

export interface SlackMessage {
  text: string;
  blocks: unknown[];
}

export function formatMessage(body: EventBody): SlackMessage {
  switch (body.type) {
    case "entitlement.created":
      return formatEntitlementCreated(entitlement(body));
    case "entitlement.updated":
      return formatEntitlementUpdated(entitlement(body));
    case "entitlement.deleted":
      return formatEntitlementDeleted(entitlement(body));
    case "entitlement.expired":
      return formatEntitlementExpired(entitlement(body));
    default:
      return formatGeneric(body);
  }
}

// Throws (zod) when an entitlement.* body is missing/malformed metadata.
function entitlement(body: EventBody): EntitlementEventPayload {
  return EntitlementEventBody.parse(body).entitlement;
}

// Course grants keep the familiar "enrolled" wording; other content types get
// neutral "granted access" copy.
function grantVerb(e: EntitlementEventPayload): string {
  return e.content.type === "course" ? "enrolled in" : "granted access to";
}

function formatEntitlementCreated(e: EntitlementEventPayload): SlackMessage {
  return {
    text: `✅ ${studentName(e)} ${grantVerb(e)} ${e.content.title}`,
    blocks: [header("✅ New entitlement"), entitlementFields(e), context(`Granted ${e.grantedAt}`)],
  };
}

function formatEntitlementUpdated(e: EntitlementEventPayload): SlackMessage {
  return {
    text: `🔄 ${studentName(e)}'s access to ${e.content.title} was updated`,
    blocks: [
      header("🔄 Entitlement updated"),
      entitlementFields(e),
      context(`Originally granted ${e.grantedAt}`),
    ],
  };
}

function formatEntitlementDeleted(e: EntitlementEventPayload): SlackMessage {
  return {
    text: `🚫 ${studentName(e)}'s access to ${e.content.title} was revoked`,
    blocks: [
      header("🚫 Entitlement removed"),
      entitlementFields(e),
      context(`Originally granted ${e.grantedAt}`),
    ],
  };
}

function formatEntitlementExpired(e: EntitlementEventPayload): SlackMessage {
  return {
    text: `⏳ ${studentName(e)}'s access to ${e.content.title} has expired`,
    blocks: [
      header("⏳ Entitlement expired"),
      entitlementFields(e),
      context(`Originally granted ${e.grantedAt}`),
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

function studentName(e: EntitlementEventPayload): string {
  return `${e.firstName} ${e.lastName}`;
}

function header(title: string): unknown {
  return { type: "header", text: { type: "plain_text", text: title, emoji: true } };
}

function field(label: string, value: string): { type: "mrkdwn"; text: string } {
  return { type: "mrkdwn", text: `*${label}*\n${value}` };
}

function entitlementFields(e: EntitlementEventPayload): unknown {
  const fields = [
    field("Student", studentName(e)),
    field("Email", e.studentEmail),
    field(contentLabel(e), e.content.title),
    field("Granted at", e.grantedAt),
  ];
  if (e.expiresAt) {
    fields.push(field("Expires", e.expiresAt));
  }
  return { type: "section", fields };
}

// "Course" for course grants; capitalized content type otherwise.
function contentLabel(e: EntitlementEventPayload): string {
  const t = e.content.type;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function context(text: string): unknown {
  return { type: "context", elements: [{ type: "mrkdwn", text }] };
}
