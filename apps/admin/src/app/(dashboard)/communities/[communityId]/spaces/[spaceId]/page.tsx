import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth/server-session";
import { isManager } from "@/lib/roles";

export default async function SpaceIndex({
  params,
}: {
  params: Promise<{ communityId: string; spaceId: string }>;
}) {
  const { communityId, spaceId } = await params;
  const session = await requireAuth();
  redirect(
    `/communities/${communityId}/spaces/${spaceId}/${isManager(session.role) ? "settings" : "members"}`,
  );
}
