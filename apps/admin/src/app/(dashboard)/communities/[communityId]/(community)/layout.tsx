import type { ReactNode } from "react";

import { requireAuth } from "@/lib/auth/server-session";
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
  const communityPromise = serverApi.getCommunity(communityId);
  const spacesPromise = serverApi.communitySpaces(communityId);
  const membersPromise = serverApi.communityMemberCount(communityId);
  await requireAuth(communityPromise, spacesPromise, membersPromise);
  const [community, spaces, memberCount] = await Promise.all([
    communityPromise,
    spacesPromise,
    membersPromise,
  ]);

  return (
    <div className="flex flex-col gap-8">
      <CommunityHeader community={community} stats={{ spaceCount: spaces.length, memberCount }} />
      {children}
    </div>
  );
}
