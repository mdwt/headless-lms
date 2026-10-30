import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth/server-session";
import { isManager } from "@/lib/roles";

export default async function CommunityIndex({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  const { communityId } = await params;
  const session = await requireAuth();
  redirect(`/communities/${communityId}/${isManager(session.role) ? "spaces" : "moderation"}`);
}
