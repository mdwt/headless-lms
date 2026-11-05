import { requirePermission } from "@/lib/auth/server-permissions";
import { serverApi } from "@/lib/api/server";
import { SettingsSurface } from "@/components/forms/settings-section";

import { DirectMessageSettings } from "../_components/direct-message-settings";

export default async function CommunityMessagesSettings({
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
      <DirectMessageSettings communityId={community.id} settings={community.settings.dm} />
    </SettingsSurface>
  );
}
