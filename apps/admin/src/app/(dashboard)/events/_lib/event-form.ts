import { z } from "zod";

import type { EventLocation, EventRecording } from "@/lib/api/types";

import { isLocalDateTime, isValidTimeZone, utcToZoned, zonedToUtc } from "./event-time";

const httpUrl = (message: string) =>
  z
    .string()
    .trim()
    .min(1, message)
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }, "Enter a link starting with http:// or https://");

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max.toLocaleString("en-US")} characters`);

export const whenSchema = z
  .object({
    start: z.string().refine(isLocalDateTime, "Pick a start"),
    end: z.string().refine(isLocalDateTime, "Pick an end"),
    timeZone: z.string().refine(isValidTimeZone, "Pick a time zone"),
  })
  .refine(
    (when) => !isLocalDateTime(when.start) || !isLocalDateTime(when.end) || when.end > when.start,
    {
      message: "End after the start",
      path: ["end"],
    },
  );

export type WhenValues = z.infer<typeof whenSchema>;

export const locationSchema = z
  .object({
    inPerson: z.boolean(),
    venueName: optional(200),
    line1: optional(200),
    line2: optional(200),
    city: optional(200),
    region: optional(200),
    postalCode: optional(200),
    country: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || /^[A-Za-z]{2}$/.test(value),
        "Use a two-letter code, such as GB",
      ),
    online: z.boolean(),
    url: z.string().trim(),
    details: optional(1000),
  })
  .superRefine((location, ctx) => {
    if (location.inPerson && !location.venueName) {
      ctx.addIssue({ code: "custom", path: ["venueName"], message: "Name the venue" });
    }
    if (location.online) {
      const result = httpUrl("Add the meeting link").safeParse(location.url);
      if (!result.success) {
        ctx.addIssue({ code: "custom", path: ["url"], message: result.error.issues[0].message });
      }
    }
  });

export type LocationValues = z.infer<typeof locationSchema>;

export const recordingSchema = z
  .object({
    url: z.string().trim(),
    details: optional(1000),
  })
  .superRefine((recording, ctx) => {
    if (!recording.url) {
      if (recording.details) {
        ctx.addIssue({ code: "custom", path: ["url"], message: "Add the recording link" });
      }
      return;
    }
    const result = httpUrl("Add the recording link").safeParse(recording.url);
    if (!result.success) {
      ctx.addIssue({ code: "custom", path: ["url"], message: result.error.issues[0].message });
    }
  });

export type RecordingValues = z.infer<typeof recordingSchema>;

export const EMPTY_LOCATION: LocationValues = {
  inPerson: false,
  venueName: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
  online: false,
  url: "",
  details: "",
};

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

export function locationValuesOf(location: EventLocation): LocationValues {
  const address = location.venue?.address;
  return {
    inPerson: location.venue !== null,
    venueName: location.venue?.name ?? "",
    line1: address?.line1 ?? "",
    line2: address?.line2 ?? "",
    city: address?.city ?? "",
    region: address?.region ?? "",
    postalCode: address?.postalCode ?? "",
    country: address?.country ?? "",
    online: location.online !== null,
    url: location.online?.url ?? "",
    details: location.online?.details ?? "",
  };
}

export function locationOf(values: LocationValues): EventLocation {
  const address = {
    line1: orNull(values.line1),
    line2: orNull(values.line2),
    city: orNull(values.city),
    region: orNull(values.region),
    postalCode: orNull(values.postalCode),
    country: orNull(values.country)?.toUpperCase() ?? null,
  };
  const hasAddress = Object.values(address).some((value) => value !== null);
  return {
    venue: values.inPerson
      ? { name: values.venueName.trim(), address: hasAddress ? address : null }
      : null,
    online: values.online ? { url: values.url.trim(), details: orNull(values.details) } : null,
  };
}

export function whenValuesOf(event: {
  startsAt: string;
  endsAt: string;
  timeZone: string;
}): WhenValues {
  return {
    start: utcToZoned(event.startsAt, event.timeZone),
    end: utcToZoned(event.endsAt, event.timeZone),
    timeZone: event.timeZone,
  };
}

export function timesOf(values: WhenValues): {
  startsAt: string;
  endsAt: string;
  timeZone: string;
} {
  return {
    startsAt: zonedToUtc(values.start, values.timeZone),
    endsAt: zonedToUtc(values.end, values.timeZone),
    timeZone: values.timeZone,
  };
}

export function recordingValuesOf(recording: EventRecording | null): RecordingValues {
  return { url: recording?.url ?? "", details: recording?.details ?? "" };
}

export function recordingOf(values: RecordingValues): EventRecording | null {
  if (!values.url.trim()) return null;
  return { url: values.url.trim(), details: orNull(values.details) };
}

export const TYPE_LABEL = {
  public: "Public: members register",
  private: "Private: by grant only",
} as const;
