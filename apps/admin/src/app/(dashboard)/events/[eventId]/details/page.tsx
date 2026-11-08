import { serverApi } from "@/lib/api/server";
import { requirePermission } from "@/lib/auth/server-permissions";

import { EventDetails } from "../_components/event-details";

export default async function EventDetailsTab({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  await requirePermission("events:write", eventId);

  const event = await serverApi.getEvent(eventId);

  return <EventDetails event={event} />;
}
