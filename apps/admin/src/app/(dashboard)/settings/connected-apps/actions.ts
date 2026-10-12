"use server";

import { revalidatePath } from "next/cache";
import { Access } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";

export async function revokeConnectedAppAction(clientId: string): Promise<void> {
  await Access.revokeConnectedApp({ clientId }, await authHeaders());
  revalidatePath("/settings/connected-apps");
}
