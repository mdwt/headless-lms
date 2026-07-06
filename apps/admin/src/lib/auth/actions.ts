"use server";

/**
 * Auth-adjacent Server Actions. `createOrganizationAction` is the write behind
 * the signup form and the no-organization gate: it runs on the server, forwards
 * the caller's freshly-set session cookie to the API, and the API's better-auth
 * organization plugin creates the org, makes it the session's active org, and
 * mirrors the creator as `owner` into the core context. This replaces the last
 * client-side `api.*` SDK call so all data flows through RSC + Server Actions.
 */

import { revalidatePath } from "next/cache";
import { Organizations } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, unwrap } from "@/lib/api/server-call";
import type { Organization } from "@/lib/api/types";


export async function createOrganizationAction(input: {
  name: string;
  slug: string;
}): Promise<Organization> {
  ensureConfigured();
  const org = unwrap(await Organizations.createOrganization({ body: input, ...(await authHeaders()) }));
  // The active-org selection now lives on the session server-side; bust the
  // layout so the next resolve renders the dashboard for the new org.
  revalidatePath("/", "layout");
  return org;
}
