"use server";

// Server actions for entitlement mutations (also used by the student detail view).

import { revalidatePath } from "next/cache";
import { Entitlements } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import type { EntitlementGrant } from "@/lib/api/types";

/** A grant targets exactly one of: a single content item or a bundle. */
export interface GrantEntitlementInput {
  orgUserId: string;
  contentId?: string | null;
  bundleId?: string | null;
  expiresAt: string | null;
}

export async function grantEntitlementAction(
  input: GrantEntitlementInput,
): Promise<EntitlementGrant> {
  const entitlement = await Entitlements.grantEntitlement(input, await authHeaders());
  revalidatePath("/entitlements");
  revalidatePath(`/students/${input.orgUserId}`);
  return entitlement;
}

export interface RevokeEntitlementInput {
  orgUserId: string;
  contentId?: string | null;
  bundleId?: string | null;
}

export async function revokeEntitlementAction(
  input: RevokeEntitlementInput,
): Promise<EntitlementGrant> {
  const entitlement = await Entitlements.revokeEntitlement(input, await authHeaders());
  revalidatePath("/entitlements");
  revalidatePath(`/students/${input.orgUserId}`);
  return entitlement;
}
