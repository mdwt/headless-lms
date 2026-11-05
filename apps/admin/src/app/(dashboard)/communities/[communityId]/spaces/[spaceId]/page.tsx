import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/server-permissions";

export default async function SpaceIndex({
  params,
}: {
  params: Promise<{ communityId: string; spaceId: string }>;
}) {
  const { communityId, spaceId } = await params;
  const { permissions } = await requirePermission("communities:read", communityId);
  redirect(
    `/communities/${communityId}/spaces/${spaceId}/${permissions.has("communities:write", communityId) ? "settings" : "members"}`,
  );
}
