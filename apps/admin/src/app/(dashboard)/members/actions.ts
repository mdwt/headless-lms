"use server";

/**
 * Members mutations as Server Actions — the write half of the pure-RSC (BFF)
 * model. Each runs on the server, calls the API via the generated SDK with the
 * incoming request's cookie forwarded per-call (never mutating the shared SDK
 * singleton — same rule as `lib/api/server.ts`), then `revalidatePath`s the
 * list so the next render streams fresh rows. No client-side cache, no
 * react-query: the server owns the data, `revalidatePath` is the refresh.
 */

import { revalidatePath } from "next/cache";
import { Organizations } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, unwrap, expectOk } from "@/lib/api/server-call";
import type { Member, Role } from "@/lib/api/types";


export async function inviteMemberAction(input: { email: string; role: Role }): Promise<Member> {
  ensureConfigured();
  const member = unwrap(
    await Organizations.inviteMember({ body: input, ...(await authHeaders()) }),
  );
  revalidatePath("/members");
  return member;
}

/** Change a member's role — targeted write for the inline role control + optimism. */
export async function updateMemberRoleAction(id: string, role: Role): Promise<void> {
  ensureConfigured();
  unwrap(await Organizations.updateMemberRole({ path: { id }, body: { role }, ...(await authHeaders()) }));
  revalidatePath("/members");
}

export async function removeMemberAction(id: string): Promise<void> {
  ensureConfigured();
  expectOk(await Organizations.removeMember({ path: { id }, ...(await authHeaders()) }));
  revalidatePath("/members");
}
