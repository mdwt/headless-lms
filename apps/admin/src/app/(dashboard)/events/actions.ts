"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Events } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import type {
  EventFile,
  EventItem,
  EventLocation,
  EventRecording,
  EventSettings,
} from "@/lib/api/types";

function revalidateEvent(): void {
  revalidatePath("/events");
  revalidatePath("/events/[eventId]", "layout");
}

export interface EventInput {
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  location: EventLocation;
  settings?: Partial<EventSettings>;
}

export interface EventPatch {
  title?: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  timeZone?: string;
  location?: EventLocation;
  thumbnailAssetId?: string | null;
  recording?: EventRecording | null;
  status?: "draft" | "published";
  settings?: Partial<EventSettings>;
}

export async function createEventAction(input: EventInput): Promise<EventItem> {
  const event = await Events.createEvent(input, await authHeaders());
  revalidatePath("/events");
  return event;
}

export async function updateEventAction(eventId: string, patch: EventPatch): Promise<EventItem> {
  const event = await Events.updateEvent({ eventId, ...patch }, await authHeaders());
  revalidateEvent();
  return event;
}

export async function setEventPublishedAction(
  eventId: string,
  status: "draft" | "published",
): Promise<void> {
  await Events.updateEvent({ eventId, status }, await authHeaders());
  revalidateEvent();
}

export async function cancelEventAction(eventId: string): Promise<void> {
  await Events.cancelEvent({ eventId }, await authHeaders());
  revalidateEvent();
}

export async function deleteEventAction(eventId: string): Promise<void> {
  await Events.deleteEvent({ eventId }, await authHeaders());
  revalidatePath("/events");
}

export async function deleteEventAndRedirectAction(eventId: string): Promise<void> {
  await Events.deleteEvent({ eventId }, await authHeaders());
  revalidatePath("/events");
  redirect("/events");
}

export async function addEventAttendeeAction(eventId: string, orgUserId: string): Promise<void> {
  await Events.addEventAttendee({ eventId, orgUserId }, await authHeaders());
  revalidateEvent();
}

export async function removeEventAttendeeAction(eventId: string, orgUserId: string): Promise<void> {
  await Events.removeEventAttendee({ eventId, orgUserId }, await authHeaders());
  revalidateEvent();
}

export async function addEventAssetAction(
  eventId: string,
  assetId: string,
  displayName?: string,
): Promise<EventFile[]> {
  const files = await Events.addEventAsset({ eventId, assetId, displayName }, await authHeaders());
  revalidateEvent();
  return files;
}

export async function renameEventAssetAction(
  eventId: string,
  assetId: string,
  displayName: string | null,
): Promise<EventFile[]> {
  const files = await Events.renameEventAsset(
    { eventId, assetId, displayName },
    await authHeaders(),
  );
  revalidateEvent();
  return files;
}

export async function removeEventAssetAction(
  eventId: string,
  assetId: string,
): Promise<EventFile[]> {
  const files = await Events.removeEventAsset({ eventId, assetId }, await authHeaders());
  revalidateEvent();
  return files;
}

export async function reorderEventAssetsAction(
  eventId: string,
  assetIds: string[],
): Promise<EventFile[]> {
  const files = await Events.reorderEventAssets({ eventId, assetIds }, await authHeaders());
  revalidateEvent();
  return files;
}
