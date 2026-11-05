import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/server-permissions";

export default async function CommunityIndex({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  const { communityId } = await params;
  const { permissions } = await requirePermission(
    ["communities:read", "communities:moderate"],
    communityId,
  );
  redirect(
    `/communities/${communityId}/${permissions.has("communities:read", communityId) ? "spaces" : "moderation"}`,
  );
}
