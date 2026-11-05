"use server";

// Server actions for people: invites, org roles, item roles, removal and ownership.

import { revalidatePath } from "next/cache";
import { Organizations, People } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";

function revalidatePeople() {
  revalidatePath("/settings/team");
  revalidatePath("/students");
}

export async function inviteMemberAction(input: { email: string; roleKey: string }): Promise<void> {
  await People.createInvite(input, await authHeaders());
  revalidatePeople();
}

export async function setOrgRoleAction(orgUserId: string, roleKey: string): Promise<void> {
  await People.setOrgRole({ orgUserId, roleKey }, await authHeaders());
  revalidatePeople();
}

export async function assignRoleAction(input: {
  orgUserId: string;
  contentId: string;
  roleKey: string;
}): Promise<void> {
  await People.assignRole(input, await authHeaders());
  revalidatePeople();
}

export async function unassignRoleAction(orgUserId: string, contentId: string): Promise<void> {
  await People.unassignRole({ orgUserId, contentId }, await authHeaders());
  revalidatePeople();
}

export async function resendInviteAction(orgUserId: string): Promise<void> {
  await People.resendInvite({ orgUserId }, await authHeaders());
  revalidatePeople();
  revalidatePath(`/students/${orgUserId}`);
}

export async function cancelInviteAction(orgUserId: string): Promise<void> {
  await People.cancelInvite({ orgUserId }, await authHeaders());
  revalidatePeople();
}

export async function removePersonAction(orgUserId: string): Promise<void> {
  await People.removePerson({ orgUserId }, await authHeaders());
  revalidatePeople();
}

export async function transferOwnershipAction(input: {
  newOwnerOrgUserId: string;
  previousOwnerRoleKey: string;
}): Promise<void> {
  await Organizations.transferOwnership(input, await authHeaders());
  revalidatePeople();
  revalidatePath("/settings", "layout");
}
