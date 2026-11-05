import { requirePermission } from "@/lib/auth/server-permissions";
import { serverApi } from "@/lib/api/server";

import { SpaceList } from "./_components/space-list";

export default async function CommunitySpacesTab({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  const { communityId } = await params;
  const { permissions } = await requirePermission("communities:read", communityId);
  const spaces = await serverApi.communitySpaces(communityId);

  return (
    <SpaceList
      communityId={communityId}
      spaces={spaces}
      canEdit={permissions.has("communities:write", communityId)}
    />
  );
}
