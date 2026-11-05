import type { ReactNode } from "react";

import { requirePermission } from "@/lib/auth/server-permissions";
import { serverApi } from "@/lib/api/server";

import { CommunityHeader } from "../_components/community-header";

export default async function CommunityLayout({
  params,
  children,
}: {
  params: Promise<{ communityId: string }>;
  children: ReactNode;
}) {
  const { communityId } = await params;
  const { permissions } = await requirePermission(
    ["communities:read", "communities:moderate"],
    communityId,
  );

  const [community, spaces, memberCount] = await Promise.all([
    serverApi.getCommunity(communityId),
    serverApi.communitySpaces(communityId),
    permissions.has("access:read")
      ? serverApi.communityMemberCount(communityId)
      : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <CommunityHeader community={community} stats={{ spaceCount: spaces.length, memberCount }} />
      {children}
    </div>
  );
}
