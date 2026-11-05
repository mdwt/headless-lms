import { requirePermission } from "@/lib/auth/server-permissions";
import { serverApi } from "@/lib/api/server";

import { ModerationQueue } from "./_components/moderation-queue";

export default async function CommunityModerationTab({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  const { communityId } = await params;
  const { permissions } = await requirePermission("communities:moderate", communityId);
  const spaces = permissions.has("communities:read", communityId)
    ? await serverApi.communitySpaces(communityId)
    : (await serverApi.memberCommunityHome(communityId)).spaces;
  const moderation = await serverApi.communityModeration(
    communityId,
    spaces,
    permissions.has("people:read"),
  );

  return <ModerationQueue communityId={communityId} moderation={moderation} />;
}
