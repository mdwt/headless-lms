import type { ReactNode } from "react";
import { requirePermission } from "@/lib/auth/server-permissions";
import { serverApi } from "@/lib/api/server";

import { requestTime } from "../_lib/event-time";
import { EventHeader } from "./_components/event-header";

export default async function EventLayout({
  params,
  children,
}: {
  params: Promise<{ eventId: string }>;
  children: ReactNode;
}) {
  const { eventId } = await params;
  await requirePermission("events:read", eventId);
  const [event, analytics] = await Promise.all([
    serverApi.getEvent(eventId),
    serverApi.eventAnalytics(eventId),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <EventHeader event={event} attendees={analytics.attendees} now={requestTime()} />
      {children}
    </div>
  );
}
