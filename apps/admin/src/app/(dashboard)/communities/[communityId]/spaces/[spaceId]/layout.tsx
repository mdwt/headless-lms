import type { ReactNode } from "react";

import { requirePermission } from "@/lib/auth/server-permissions";
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
  await requirePermission("communities:read", communityId);
  const [community, space] = await Promise.all([
    serverApi.getCommunity(communityId),
    serverApi.getSpace(communityId, spaceId),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <SpaceHeader community={community} space={space} />
      {children}
    </div>
  );
}
