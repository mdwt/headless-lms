import { requireManager } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";

import { CommunityNotifications } from "./_components/community-notifications";

export default async function CommunityNotificationsTab({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  const { communityId } = await params;
  const automationsPromise = serverApi.communityAutomations(communityId);
  await requireManager(automationsPromise);

  return <CommunityNotifications automations={await automationsPromise} />;
}
