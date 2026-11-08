import type {
  EmailTemplateParams,
  EventEmailParams,
  TemplateContext,
} from "@headless-lms/core/types";
import { Link, Section } from "@react-email/components";
import { defineEmail, portal } from "./community.js";
import { EmailButton, Layout, Paragraph, PREVIEW_CTX } from "./layout.js";

const PREVIEW_EVENT: EventEmailParams = {
  eventId: "evn_1",
  eventTitle: "Conversation practice",
  startsAt: "2026-05-12T16:00:00.000Z",
  endsAt: "2026-05-12T17:00:00.000Z",
  timeZone: "Europe/London",
};

export function eventPage(ctx: TemplateContext, eventId: string): string {
  return portal(ctx, `/events/${eventId}`);
}

function formatIn(value: string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(date);
  }
}

export function eventWhen(params: EventEmailParams): string {
  const day = formatIn(params.startsAt, params.timeZone, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = { hour: "numeric", minute: "2-digit" } as const;
  const from = formatIn(params.startsAt, params.timeZone, time);
  const to = formatIn(params.endsAt, params.timeZone, time);
  return `${day}, ${from} – ${to} (${params.timeZone})`;
}

function calendarStamp(value: string): string {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export function googleCalendarUrl(ctx: TemplateContext, params: EventEmailParams): string {
  const query = new URLSearchParams({
    action: "TEMPLATE",
    text: params.eventTitle,
    dates: `${calendarStamp(params.startsAt)}/${calendarStamp(params.endsAt)}`,
    details: eventPage(ctx, params.eventId),
    ctz: params.timeZone,
  });
  return `https://calendar.google.com/calendar/render?${query.toString()}`;
}

export function outlookCalendarUrl(ctx: TemplateContext, params: EventEmailParams): string {
  const query = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: params.eventTitle,
    startdt: new Date(params.startsAt).toISOString(),
    enddt: new Date(params.endsAt).toISOString(),
    body: eventPage(ctx, params.eventId),
  });
  return `https://outlook.live.com/calendar/0/action/compose?${query.toString()}`;
}

type Granted = EmailTemplateParams["eventGranted"];

function EventGranted({ ctx, params }: { ctx: TemplateContext; params: Granted }) {
  return (
    <Layout ctx={ctx} heading={`You're going to ${params.eventTitle}`}>
      <Paragraph>{eventWhen(params)}</Paragraph>
      <EmailButton href={eventPage(ctx, params.eventId)}>Open event</EmailButton>
      <Section>
        <Paragraph>
          <Link href={googleCalendarUrl(ctx, params)}>Add to Google Calendar</Link>
          {" · "}
          <Link href={outlookCalendarUrl(ctx, params)}>Add to Outlook</Link>
        </Paragraph>
      </Section>
    </Layout>
  );
}

EventGranted.PreviewProps = { ctx: PREVIEW_CTX, params: PREVIEW_EVENT };

export const eventGranted = {
  subject: (_ctx: TemplateContext, params: Granted) => `You're going to ${params.eventTitle}`,
  Component: EventGranted,
};

const CHANGED: Record<EmailTemplateParams["eventChanged"]["changed"], string> = {
  time: "The time has changed.",
  location: "The location has changed. Open the event for the new details.",
  time_and_location: "The time and the location have changed. Open the event for the new details.",
};

const open = (ctx: TemplateContext, params: EventEmailParams) => ({
  href: eventPage(ctx, params.eventId),
  label: "Open event",
});

export const eventStartingSoon = defineEmail<"eventStartingSoon">({
  subject: (_ctx, params) => `${params.eventTitle} starts in ${params.leadText}`,
  heading: (params) => `${params.eventTitle} starts in ${params.leadText}`,
  lines: (params) => [eventWhen(params), "Open the event for the link."],
  button: open,
  preview: { ...PREVIEW_EVENT, leadText: "1 hour" },
});

export const eventChanged = defineEmail<"eventChanged">({
  subject: (_ctx, params) => `${params.eventTitle} has changed`,
  heading: (params) => `${params.eventTitle} has changed`,
  lines: (params) => [CHANGED[params.changed], eventWhen(params)],
  button: open,
  preview: { ...PREVIEW_EVENT, changed: "time" },
});

export const eventCanceled = defineEmail<"eventCanceled">({
  subject: (_ctx, params) => `${params.eventTitle} was canceled`,
  heading: (params) => `${params.eventTitle} was canceled`,
  lines: (params) => [`It was planned for ${eventWhen(params)}.`],
  button: open,
  preview: PREVIEW_EVENT,
});

export const eventRevoked = defineEmail<"eventRevoked">({
  subject: (_ctx, params) => `You're no longer going to ${params.eventTitle}`,
  heading: (params) => `You're no longer going to ${params.eventTitle}`,
  lines: (params) => [`You've been removed from the event on ${eventWhen(params)}.`],
  button: open,
  preview: PREVIEW_EVENT,
});
