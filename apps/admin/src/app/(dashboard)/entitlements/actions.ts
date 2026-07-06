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
import { Entitlements } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, unwrap } from "@/lib/api/server-call";
import type { Entitlement } from "@/lib/api/types";


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
    await Entitlements.grantEntitlement({ body: input, ...(await authHeaders()) }),
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
      ...(await authHeaders()),
    }),
  );
  revalidatePath("/entitlements");
  return entitlement;
}
