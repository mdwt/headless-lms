import type { ReactNode } from "react";

import { CommunitySettingsNav } from "./_components/community-settings-nav";

export default async function CommunitySettingsLayout({
  params,
  children,
}: {
  params: Promise<{ communityId: string }>;
  children: ReactNode;
}) {
  const { communityId } = await params;

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
      <aside className="lg:w-52 lg:shrink-0">
        <CommunitySettingsNav communityId={communityId} />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
