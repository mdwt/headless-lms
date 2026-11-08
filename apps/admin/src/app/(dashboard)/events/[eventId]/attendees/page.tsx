import { serverApi } from "@/lib/api/server";
import { requirePermission } from "@/lib/auth/server-permissions";
import { parseListParams } from "@/lib/table/parse-list-params";

import { hasEnded, requestTime } from "../../_lib/event-time";
import { AttendeesTable } from "../_components/attendees-table";

function addBlockedReason(
  event: { status: string; endsAt: string; settings: { capacity: number | null } },
  attendees: number,
  now: number,
): string | null {
  if (event.status !== "published") return "Publish the event to add people.";
  if (hasEnded(event, now)) return "The event has ended.";
  if (event.settings.capacity !== null && attendees >= event.settings.capacity) {
    return "The event is full. Raise its capacity to add people.";
  }
  return null;
}

export default async function EventAttendeesTab({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { eventId } = await params;
  const { permissions } = await requirePermission("events:read", eventId);
  const listParams = parseListParams(await searchParams, { pageSize: 20, initialSort: [] });

  const [event, page] = await Promise.all([
    serverApi.getEvent(eventId),
    serverApi.eventAttendees(eventId, listParams),
  ]);
  const canRun = permissions.has("events:write", eventId) && event.status !== "canceled";
  const canAdd = canRun && permissions.has("people:read");

  const [people, attending] = canAdd
    ? await Promise.all([
        serverApi.peopleLite(),
        page.total > page.rows.length
          ? serverApi.eventAttendees(eventId, { page: 1, pageSize: 100 }).then((p) => p.rows)
          : Promise.resolve(page.rows),
      ])
    : [[], []];
  const going = new Set(attending.map((a) => a.orgUserId));

  return (
    <AttendeesTable
      eventId={eventId}
      rows={page.rows}
      total={page.total}
      params={listParams}
      canRemove={canRun}
      canAdd={canAdd}
      addBlockedReason={addBlockedReason(event, page.total, requestTime())}
      candidates={people.filter((p) => !going.has(p.id))}
      notifies={event.settings.notifications}
    />
  );
}
