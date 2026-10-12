"use server";

import { revalidatePath } from "next/cache";
import { Access } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import type { AccessScope } from "@/lib/api/types";

export async function createApiKeyAction({
  name,
  scopes,
}: {
  name: string;
  scopes: AccessScope[];
}): Promise<{ key: string }> {
  const created = await Access.createApiKey({ name, scopes }, await authHeaders());
  revalidatePath("/settings/api-keys");
  return { key: created.key };
}

export async function deleteApiKeyAction(id: string): Promise<void> {
  await Access.deleteApiKey({ id }, await authHeaders());
  revalidatePath("/settings/api-keys");
}
