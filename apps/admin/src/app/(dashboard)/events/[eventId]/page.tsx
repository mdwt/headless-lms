import { redirect } from "next/navigation";

import { getPermissions } from "@/lib/auth/server-permissions";

export default async function EventIndex({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const permissions = await getPermissions();
  redirect(
    `/events/${eventId}/${permissions.has("events:write", eventId) ? "details" : "attendees"}`,
  );
}
