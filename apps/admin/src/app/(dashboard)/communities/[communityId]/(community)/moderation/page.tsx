import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";

import { ModerationQueue } from "./_components/moderation-queue";

export default async function CommunityModerationTab({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  const { communityId } = await params;
  const moderationPromise = serverApi.communityModeration(communityId);
  await requireAuth(moderationPromise);

  return <ModerationQueue communityId={communityId} moderation={await moderationPromise} />;
}
