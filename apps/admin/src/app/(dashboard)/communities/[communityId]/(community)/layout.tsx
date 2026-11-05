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

  if (!permissions.has("communities:read", communityId)) {
    const home = await serverApi.memberCommunityHome(communityId);
    return (
      <div className="flex flex-col gap-8">
        <CommunityHeader
          id={communityId}
          title={home.title}
          community={null}
          stats={{ spaceCount: home.spaces.length, memberCount: null }}
        />
        {children}
      </div>
    );
  }

  const [community, spaces, memberCount] = await Promise.all([
    serverApi.getCommunity(communityId),
    serverApi.communitySpaces(communityId),
    permissions.has("access:read")
      ? serverApi.communityMemberCount(communityId)
      : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <CommunityHeader
        id={communityId}
        title={community.title}
        community={community}
        stats={{ spaceCount: spaces.length, memberCount }}
      />
      {children}
    </div>
  );
}
