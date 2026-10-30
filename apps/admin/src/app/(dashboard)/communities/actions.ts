"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Automations, Communities } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import { serverApi } from "@/lib/api/server";
import type {
  Automation,
  Community,
  CommunityStatus,
  DmSettings,
  Space,
  SpaceAccessRule,
  SpaceSettings,
} from "@/lib/api/types";

function revalidateCommunity(): void {
  revalidatePath("/communities");
  revalidatePath("/communities/[communityId]", "layout");
}

export interface CommunityPatch {
  title?: string;
  description?: string;
  thumbnailAssetId?: string | null;
}

export async function createCommunityAction(input: {
  title: string;
  description?: string;
}): Promise<Community> {
  const community = await Communities.createCommunity(input, await authHeaders());
  revalidatePath("/communities");
  return community;
}

export async function updateCommunityAction(
  communityId: string,
  patch: CommunityPatch,
): Promise<Community> {
  const community = await Communities.updateCommunity(
    { communityId, ...patch },
    await authHeaders(),
  );
  revalidateCommunity();
  return community;
}

export async function setCommunityPublishedAction(
  communityId: string,
  status: CommunityStatus,
): Promise<void> {
  const headers = await authHeaders();
  if (status === "published") await Communities.publishCommunity({ communityId }, headers);
  else await Communities.unpublishCommunity({ communityId }, headers);
  revalidateCommunity();
}

export async function deleteCommunityAction(communityId: string): Promise<void> {
  await Communities.deleteCommunity({ communityId }, await authHeaders());
  revalidatePath("/communities");
}

export async function deleteCommunityAndRedirectAction(communityId: string): Promise<void> {
  await Communities.deleteCommunity({ communityId }, await authHeaders());
  revalidatePath("/communities");
  redirect("/communities");
}

export async function patchDmSettingsAction(
  communityId: string,
  patch: Partial<DmSettings>,
): Promise<DmSettings> {
  const community = await Communities.patchCommunityDmSettings(
    { communityId, ...patch },
    await authHeaders(),
  );
  revalidateCommunity();
  return community.settings.dm;
}

export interface SpaceInput {
  name?: string;
  description?: string;
  accessRule?: SpaceAccessRule;
  capacity?: number | null;
  settings?: Partial<SpaceSettings>;
}

export async function createSpaceAction(
  communityId: string,
  input: SpaceInput & { name: string },
): Promise<Space> {
  const space = await Communities.createSpace({ communityId, ...input }, await authHeaders());
  revalidateCommunity();
  return space;
}

export async function updateSpaceAction(
  communityId: string,
  spaceId: string,
  patch: SpaceInput,
): Promise<Space> {
  const space = await Communities.updateSpace(
    { communityId, spaceId, ...patch },
    await authHeaders(),
  );
  revalidateCommunity();
  return space;
}

export async function deleteSpaceAndRedirectAction(
  communityId: string,
  spaceId: string,
): Promise<void> {
  await Communities.deleteSpace({ communityId, spaceId }, await authHeaders());
  revalidateCommunity();
  redirect(`/communities/${communityId}/spaces`);
}

export async function reorderSpacesAction(communityId: string, ids: string[]): Promise<Space[]> {
  const spaces = await Communities.reorderSpaces({ communityId, ids }, await authHeaders());
  revalidateCommunity();
  return spaces;
}

export async function setSpaceTopicsAction(
  communityId: string,
  spaceId: string,
  topics: { id?: string; name: string }[],
): Promise<void> {
  await Communities.setSpaceTopics({ communityId, spaceId, topics }, await authHeaders());
  revalidateCommunity();
}

export async function addSpaceLinkAction(
  communityId: string,
  spaceId: string,
  contentId: string,
): Promise<void> {
  await Communities.addSpaceLink({ communityId, spaceId, contentId }, await authHeaders());
  revalidateCommunity();
}

export async function removeSpaceLinkAction(
  communityId: string,
  spaceId: string,
  linkId: string,
): Promise<void> {
  await Communities.removeSpaceLink({ communityId, spaceId, linkId }, await authHeaders());
  revalidateCommunity();
}

export async function reorderSpaceLinksAction(
  communityId: string,
  spaceId: string,
  ids: string[],
): Promise<void> {
  await Communities.reorderSpaceLinks({ communityId, spaceId, ids }, await authHeaders());
  revalidateCommunity();
}

export type SpaceMemberMove = "add" | "invite" | "approve" | "decline" | "remove";

export async function moveSpaceMemberAction(
  communityId: string,
  spaceId: string,
  orgUserId: string,
  move: SpaceMemberMove,
): Promise<void> {
  const headers = await authHeaders();
  const params = { communityId, spaceId, orgUserId };
  if (move === "add") await Communities.addCommunitySpaceMember(params, headers);
  else if (move === "invite") await Communities.inviteCommunitySpaceMember(params, headers);
  else if (move === "approve") await Communities.approveCommunitySpaceRequest(params, headers);
  else if (move === "decline") await Communities.declineCommunitySpaceRequest(params, headers);
  else await Communities.removeCommunitySpaceMember(params, headers);
  revalidateCommunity();
}

export type PostMove = "approve" | "remove" | "restore" | "dismiss";

export async function moderatePostAction(
  communityId: string,
  postId: string,
  move: PostMove,
): Promise<void> {
  const headers = await authHeaders();
  const params = { communityId, postId };
  if (move === "approve") await Communities.approveCommunityPost(params, headers);
  else if (move === "remove") await Communities.removeCommunityPost(params, headers);
  else if (move === "restore") await Communities.restoreCommunityPost(params, headers);
  else await Communities.resolveCommunityPostFlags({ ...params, resolution: "dismissed" }, headers);
  revalidateCommunity();
}

export async function moderateCommentAction(
  communityId: string,
  commentId: string,
  move: "remove" | "dismiss",
): Promise<void> {
  const headers = await authHeaders();
  const params = { communityId, commentId };
  if (move === "remove") await Communities.removeCommunityComment(params, headers);
  else
    await Communities.resolveCommunityCommentFlags({ ...params, resolution: "dismissed" }, headers);
  revalidateCommunity();
}

export async function dismissMessageFlagsAction(
  communityId: string,
  messageId: string,
): Promise<void> {
  await Communities.resolveCommunityMessageFlags(
    { communityId, messageId, resolution: "dismissed" },
    await authHeaders(),
  );
  revalidateCommunity();
}

export async function setChatLockedAction(
  communityId: string,
  chatId: string,
  locked: boolean,
): Promise<void> {
  const headers = await authHeaders();
  if (locked) await Communities.lockCommunityChat({ communityId, chatId }, headers);
  else await Communities.unlockCommunityChat({ communityId, chatId }, headers);
  revalidateCommunity();
}

export async function listCommunityNotificationsAction(communityId: string): Promise<Automation[]> {
  return await serverApi.communityAutomations(communityId);
}

export async function setAutomationEnabledAction(id: string, enabled: boolean): Promise<void> {
  await Automations.updateAutomation({ id, enabled }, await authHeaders());
  revalidateCommunity();
  revalidatePath("/automations/workflows");
}
