"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { EventStatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/lib/auth/permissions-context";
import type { EventItem } from "@/lib/api/types";
import { formatNumber } from "@/lib/format";

import {
  cancelEventAction,
  deleteEventAndRedirectAction,
  setEventPublishedAction,
} from "../../actions";
import { formatEventDate, hasEnded } from "../../_lib/event-time";
import { EventTabsNav } from "./event-tabs-nav";

function goingText(attendees: number, capacity: number | null): string {
  if (capacity !== null) return `${formatNumber(attendees)} of ${formatNumber(capacity)} going`;
  return `${formatNumber(attendees)} going`;
}

function cancelDescription(event: EventItem, attendees: number) {
  const people = attendees === 1 ? "1 person going" : `${formatNumber(attendees)} people going`;
  const told =
    attendees === 0
      ? "No one is going yet."
      : event.settings.notifications
        ? `${people} will be told.`
        : `Notifications are off for this event, so the ${people} won't be told.`;
  return `${told} A canceled event can't be published or changed again.`;
}

export function EventHeader({
  event,
  attendees,
  now,
}: {
  event: EventItem;
  attendees: number;
  now: number;
}) {
  const permissions = usePermissions();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<"cancel" | "delete" | null>(null);

  const canceled = event.status === "canceled";
  const canRun = permissions.has("events:write", event.id) && !canceled;
  const canDelete = permissions.has("events:delete", event.id);

  function onTogglePublish() {
    const next = event.status === "published" ? "draft" : "published";
    startTransition(async () => {
      try {
        await setEventPublishedAction(event.id, next);
        toast.success(next === "published" ? "Event published" : "Moved to draft");
      } catch (e) {
        toast.error("Couldn't update status", { description: (e as Error).message });
        router.refresh();
      }
    });
  }

  function onCancel() {
    startTransition(async () => {
      try {
        await cancelEventAction(event.id);
        toast.success("Event canceled");
        setConfirming(null);
      } catch (e) {
        toast.error("Couldn't cancel event", { description: (e as Error).message });
        router.refresh();
      }
    });
  }

  function onDelete() {
    startTransition(async () => {
      try {
        await deleteEventAndRedirectAction(event.id);
      } catch (e) {
        toast.error("Couldn't delete event", { description: (e as Error).message });
        setConfirming(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/events"
        className="inline-flex w-fit items-center gap-1 rounded-md text-sm text-ink-3 outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <ChevronLeft className="size-4" />
        Events
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-ink text-balance">
            {event.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-3">
            <EventStatusBadge status={event.status} ended={hasEnded(event, now)} />
            <Dot />
            <span>{formatEventDate(event)}</span>
            <Dot />
            <span className="tabular-nums">{goingText(attendees, event.settings.capacity)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canRun && (
            <Button variant="primary" onClick={onTogglePublish} disabled={isPending}>
              {event.status === "published" ? "Unpublish" : "Publish"}
            </Button>
          )}
          {canRun && (
            <Button onClick={() => setConfirming("cancel")} disabled={isPending}>
              Cancel event
            </Button>
          )}
          {canDelete && (
            <Button
              variant="destructive"
              onClick={() => setConfirming("delete")}
              disabled={isPending}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      <EventTabsNav eventId={event.id} />

      <ConfirmDialog
        open={confirming === "cancel"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Cancel event?"
        description={cancelDescription(event, attendees)}
        confirmLabel="Cancel event"
        cancelLabel="Keep event"
        destructive
        pending={isPending}
        onConfirm={onCancel}
      />

      <ConfirmDialog
        open={confirming === "delete"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Delete event?"
        description={
          <>
            This permanently deletes <span className="font-medium text-ink">{event.title}</span>.
            Its attendees lose it, and its files stay in the media library. This can&apos;t be
            undone.
          </>
        }
        confirmLabel="Delete event"
        destructive
        pending={isPending}
        onConfirm={onDelete}
      />
    </div>
  );
}

function Dot() {
  return (
    <span aria-hidden className="text-ink-4">
      ·
    </span>
  );
}
