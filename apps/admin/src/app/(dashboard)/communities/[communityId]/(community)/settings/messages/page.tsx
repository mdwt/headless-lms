import { requireManager } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { SettingsSurface } from "@/components/forms/settings-section";

import { DirectMessageSettings } from "../_components/direct-message-settings";

export default async function CommunityMessagesSettings({
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
      <DirectMessageSettings communityId={community.id} settings={community.settings.dm} />
    </SettingsSurface>
  );
}
