"use server";

// Server actions for member mutations.

import { revalidatePath } from "next/cache";
import { Organizations, type UpdateMemberRoleData } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import type { Role } from "@/lib/api/types";

export async function inviteMemberAction(input: {
  email: string;
  role: Exclude<Role, "owner">;
}): Promise<void> {
  await Organizations.createInvite(input, await authHeaders());
  revalidatePath("/settings/team");
}

/** Change a member's role — targeted write for the inline role control + optimism. */
export async function updateMemberRoleAction(
  id: string,
  role: UpdateMemberRoleData["body"]["role"],
): Promise<void> {
  await Organizations.updateMemberRole({ id, role }, await authHeaders());
  revalidatePath("/settings/team");
}

export async function removeModeratorRoleAction(id: string): Promise<void> {
  await Organizations.updateMemberRole({ id, role: "student" }, await authHeaders());
  revalidatePath("/settings/team");
  revalidatePath("/students");
}

export async function removeMemberAction(id: string): Promise<void> {
  await Organizations.removeMember({ id }, await authHeaders());
  revalidatePath("/settings/team");
}
