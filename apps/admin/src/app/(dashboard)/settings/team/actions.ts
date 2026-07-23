"use server";

// Server actions for member mutations.

import { revalidatePath } from "next/cache";
import { Invites, Organizations } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, unwrap, expectOk } from "@/lib/api/server-call";
import type { Role } from "@/lib/api/types";

export async function inviteMemberAction(input: {
  email: string;
  role: Exclude<Role, "owner">;
}): Promise<void> {
  ensureConfigured();
  unwrap(await Invites.createInvite({ body: input, ...(await authHeaders()) }));
  revalidatePath("/settings/team");
}

/** Change a member's role — targeted write for the inline role control + optimism. */
export async function updateMemberRoleAction(id: string, role: Role): Promise<void> {
  ensureConfigured();
  unwrap(await Organizations.updateMemberRole({ path: { id }, body: { role }, ...(await authHeaders()) }));
  revalidatePath("/settings/team");
}

export async function removeMemberAction(id: string): Promise<void> {
  ensureConfigured();
  expectOk(await Organizations.removeMember({ path: { id }, ...(await authHeaders()) }));
  revalidatePath("/settings/team");
}
