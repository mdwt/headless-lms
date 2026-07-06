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
import { cookies } from "next/headers";
import { Organizations, configureSdk } from "@headless-lms/sdk";

import { unwrap } from "@/lib/api/shared";
import type { Organization } from "@/lib/api/types";

const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  configureSdk({ baseUrl: API_URL });
  configured = true;
}

async function auth(): Promise<{ headers: { cookie: string } }> {
  return { headers: { cookie: (await cookies()).toString() } };
}

export async function createOrganizationAction(input: {
  name: string;
  slug: string;
}): Promise<Organization> {
  ensureConfigured();
  const org = unwrap(await Organizations.createOrganization({ body: input, ...(await auth()) }));
  // The active-org selection now lives on the session server-side; bust the
  // layout so the next resolve renders the dashboard for the new org.
  revalidatePath("/", "layout");
  return org;
}
