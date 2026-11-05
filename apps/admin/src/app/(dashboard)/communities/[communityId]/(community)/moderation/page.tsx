import { requirePermission } from "@/lib/auth/server-permissions";
import { serverApi } from "@/lib/api/server";

import { ModerationQueue } from "./_components/moderation-queue";

export default async function CommunityModerationTab({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  const { communityId } = await params;
  await requirePermission("communities:moderate", communityId);
  const spaces = await serverApi.communitySpaces(communityId);
  const moderation = await serverApi.communityModeration(communityId, spaces);

  return <ModerationQueue communityId={communityId} moderation={moderation} />;
}
