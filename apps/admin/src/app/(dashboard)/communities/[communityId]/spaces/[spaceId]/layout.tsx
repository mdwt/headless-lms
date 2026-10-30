import type { ReactNode } from "react";

import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";

import { SpaceHeader } from "./_components/space-header";

export default async function SpaceLayout({
  params,
  children,
}: {
  params: Promise<{ communityId: string; spaceId: string }>;
  children: ReactNode;
}) {
  const { communityId, spaceId } = await params;
  const communityPromise = serverApi.getCommunity(communityId);
  const spacePromise = serverApi.getSpace(communityId, spaceId);
  await requireAuth(communityPromise, spacePromise);
  const [community, space] = await Promise.all([communityPromise, spacePromise]);

  return (
    <div className="flex flex-col gap-8">
      <SpaceHeader community={community} space={space} />
      {children}
    </div>
  );
}
