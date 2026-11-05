import { requirePermission } from "@/lib/auth/server-permissions";
import { serverApi } from "@/lib/api/server";
import { SettingsSurface } from "@/components/forms/settings-section";

import { CommunityBasicsForm } from "./_components/community-basics-form";
import { CommunityThumbnail } from "./_components/community-thumbnail";

export default async function CommunitySettingsTab({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  const { communityId } = await params;
  await requirePermission("communities:write", communityId);
  const communityPromise = serverApi.getCommunity(communityId);
  const community = await communityPromise;

  return (
    <SettingsSurface>
      <CommunityBasicsForm community={community} />
      <CommunityThumbnail
        communityId={community.id}
        assetId={community.thumbnailAssetId}
        url={community.thumbnailUrl}
      />
    </SettingsSurface>
  );
}
