"use server";

import { revalidatePath } from "next/cache";
import { Access } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";

export async function createApiKeyAction({
  name,
  role,
  expiresInDays,
}: {
  name: string;
  role: string;
  expiresInDays?: number;
}): Promise<{ key: string }> {
  const created = await Access.createApiKey(
    { name, role, ...(expiresInDays !== undefined && { expiresInDays }) },
    await authHeaders(),
  );
  revalidatePath("/settings/api-keys");
  return { key: created.key };
}

export async function deleteApiKeyAction(id: string): Promise<void> {
  await Access.deleteApiKey({ id }, await authHeaders());
  revalidatePath("/settings/api-keys");
}
