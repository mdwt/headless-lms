import { requireManager } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { SettingsSurface } from "@/components/forms/settings-section";

import { CommunityBasicsForm } from "./_components/community-basics-form";
import { CommunityThumbnail } from "./_components/community-thumbnail";
import { DirectMessageSettings } from "./_components/direct-message-settings";

export default async function CommunitySettingsTab({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  const { communityId } = await params;
  const communityPromise = serverApi.getCommunity(communityId);
  await requireManager(communityPromise);
  const community = await communityPromise;

  return (
    <SettingsSurface>
      <CommunityBasicsForm community={community} />
      <CommunityThumbnail
        communityId={community.id}
        assetId={community.thumbnailAssetId}
        url={community.thumbnailUrl}
      />
      <DirectMessageSettings communityId={community.id} settings={community.settings.dm} />
    </SettingsSurface>
  );
}
