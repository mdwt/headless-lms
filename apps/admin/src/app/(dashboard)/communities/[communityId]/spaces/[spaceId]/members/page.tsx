import { Users } from "lucide-react";

import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";

import { SpaceMembers } from "./_components/space-members";

const STAFF = new Set(["owner", "admin", "instructor"]);

export default async function SpaceMembersTab({
  params,
}: {
  params: Promise<{ communityId: string; spaceId: string }>;
}) {
  const { communityId, spaceId } = await params;
  const spacePromise = serverApi.getSpace(communityId, spaceId);
  await requireAuth(spacePromise);
  const space = await spacePromise;

  if (space.accessRule === "all_members") {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-line px-6 text-center">
        <Users className="size-5 text-ink-3" aria-hidden />
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-medium tracking-tight text-ink">Open to every member</h2>
          <p className="max-w-[44ch] text-sm text-pretty text-ink-3">
            Everyone who holds the community can open this space, so there&apos;s no member list to
            manage. Make it by request or by invite to choose who&apos;s in.
          </p>
        </div>
      </div>
    );
  }

  const [members, holders] = await Promise.all([
    serverApi.spaceMembers(communityId, spaceId),
    serverApi.communityMembersLite(communityId),
  ]);
  const placed = new Set(members.filter((m) => m.status !== "revoked").map((m) => m.orgUserId));

  return (
    <SpaceMembers
      communityId={communityId}
      space={space}
      members={members}
      candidates={holders.filter((h) => !placed.has(h.id) && !STAFF.has(h.role))}
    />
  );
}
