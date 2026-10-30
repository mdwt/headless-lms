import { requireManager } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";

import { SpaceList } from "./_components/space-list";

export default async function CommunitySpacesTab({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  const { communityId } = await params;
  const spacesPromise = serverApi.communitySpaces(communityId);
  await requireManager(spacesPromise);

  return <SpaceList communityId={communityId} spaces={await spacesPromise} />;
}
