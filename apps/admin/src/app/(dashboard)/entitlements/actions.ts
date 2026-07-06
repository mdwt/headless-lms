"use server";

/**
 * Entitlements mutations as Server Actions — the write half of the pure-RSC
 * (BFF) model. Each runs on the server, calls the API via the generated SDK
 * with the incoming request's cookie forwarded per-call (never mutating the
 * shared SDK singleton — same rule as `lib/api/server.ts`), then
 * `revalidatePath`s the list so the next render streams fresh rows. No
 * client-side cache, no react-query: the server owns the data, `revalidatePath`
 * is the refresh.
 *
 * These are exported so the students detail view can grant/revoke inline too.
 */

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { Entitlements, configureSdk } from "@headless-lms/sdk";

import { unwrap } from "@/lib/api/shared";
import type { Entitlement } from "@/lib/api/types";

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

export interface GrantEntitlementInput {
  studentId: string;
  courseId: string;
  expiresAt: string | null;
}

export async function grantEntitlementAction(
  input: GrantEntitlementInput,
): Promise<Entitlement> {
  ensureConfigured();
  const entitlement = unwrap(
    await Entitlements.grantEntitlement({ body: input, ...(await auth()) }),
  );
  revalidatePath("/entitlements");
  return entitlement;
}

/**
 * Revoke/reinstate — the targeted status write behind the row actions and the
 * confirm dialog. `revoke` → `revoked`, `reinstate` → `active`, matching the
 * former `revoke/reinstate` client mutations.
 */
export async function setEntitlementStatusAction(
  id: string,
  action: "revoke" | "reinstate",
): Promise<Entitlement> {
  ensureConfigured();
  const status: Entitlement["status"] = action === "revoke" ? "revoked" : "active";
  const entitlement = unwrap(
    await Entitlements.setEntitlementStatus({
      path: { id },
      body: { status },
      ...(await auth()),
    }),
  );
  revalidatePath("/entitlements");
  return entitlement;
}
