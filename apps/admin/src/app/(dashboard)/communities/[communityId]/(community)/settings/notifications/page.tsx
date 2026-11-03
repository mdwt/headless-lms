import { requireManager } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { SettingsSurface } from "@/components/forms/settings-section";

import { CommunityCategories } from "../_components/community-categories";
import { DigestScheduleForm } from "../_components/digest-schedule-form";

export default async function CommunityNotificationSettings({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  const { communityId } = await params;
  const communityPromise = serverApi.getCommunity(communityId);
  await requireManager(communityPromise);
  const [community, list, types, channels, spaces] = await Promise.all([
    communityPromise,
    serverApi.communityNotificationCategories(communityId),
    serverApi.notificationTypes("community"),
    serverApi.notificationChannels(),
    serverApi.communitySpaces(communityId),
  ]);

  return (
    <SettingsSurface>
      <DigestScheduleForm communityId={community.id} digest={community.settings.digest} />
      <CommunityCategories
        communityId={community.id}
        list={list}
        types={types}
        channels={channels}
        spaces={spaces.map((s) => ({ id: s.id, name: s.name }))}
      />
    </SettingsSurface>
  );
}
