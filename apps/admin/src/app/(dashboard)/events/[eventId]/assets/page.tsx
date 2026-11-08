import { serverApi } from "@/lib/api/server";
import { requirePermission } from "@/lib/auth/server-permissions";

import { EventFilesPanel } from "../_components/event-assets-panel";

export default async function EventAssetsTab({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { permissions } = await requirePermission("events:read", eventId);

  const [event, assets] = await Promise.all([
    serverApi.getEvent(eventId),
    serverApi.listEventAssets(eventId),
  ]);

  return (
    <EventFilesPanel
      eventId={eventId}
      assets={assets}
      canEdit={permissions.has("events:write", eventId) && event.status !== "canceled"}
    />
  );
}
