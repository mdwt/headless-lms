"use server";

// Server actions for connected-app mutations.

import { revalidatePath } from "next/cache";
import { ConnectedApps } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, expectOk } from "@/lib/api/server-call";


export async function revokeConnectedAppAction(id: string): Promise<void> {
  ensureConfigured();
  expectOk(await ConnectedApps.revokeConnectedApp({ path: { id }, ...(await authHeaders()) }));
  revalidatePath("/connected-apps");
}
