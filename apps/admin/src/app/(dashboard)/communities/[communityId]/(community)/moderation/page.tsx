import { ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/data-table/states";
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
  if (!(await serverApi.isCommunityMember(communityId))) {
    return (
      <EmptyState
        icon={<ShieldCheck />}
        title="You're not a member of this community"
        description="You moderate a community while you're a member of it. Ask someone who manages access to give you access to it."
      />
    );
  }
  const spaces = await serverApi.communitySpaces(communityId);
  const moderation = await serverApi.communityModeration(communityId, spaces);

  return <ModerationQueue communityId={communityId} moderation={moderation} />;
}
