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
import { cookies } from "next/headers";
import { Organizations, configureSdk } from "@headless-lms/sdk";

import { unwrap, expectOk } from "@/lib/api/shared";
import type { Member, Role } from "@/lib/api/types";

const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  configureSdk({ baseUrl: API_URL });
  configured = true;
}

/** Per-call header bag forwarding the caller's session cookie to the API. */
async function auth(): Promise<{ headers: { cookie: string } }> {
  return { headers: { cookie: (await cookies()).toString() } };
}

export async function inviteMemberAction(input: { email: string; role: Role }): Promise<Member> {
  ensureConfigured();
  const member = unwrap(
    await Organizations.inviteMember({ body: input, ...(await auth()) }),
  );
  revalidatePath("/members");
  return member;
}

/** Change a member's role — targeted write for the inline role control + optimism. */
export async function updateMemberRoleAction(id: string, role: Role): Promise<void> {
  ensureConfigured();
  unwrap(await Organizations.updateMemberRole({ path: { id }, body: { role }, ...(await auth()) }));
  revalidatePath("/members");
}

export async function removeMemberAction(id: string): Promise<void> {
  ensureConfigured();
  expectOk(await Organizations.removeMember({ path: { id }, ...(await auth()) }));
  revalidatePath("/members");
}
