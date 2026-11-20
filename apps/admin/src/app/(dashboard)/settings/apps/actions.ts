"use server";

import { revalidatePath } from "next/cache";
import { Apps } from "@headless-lms/sdk";

import { refusable, type Refusal } from "@/lib/api/refusal";
import { authHeaders } from "@/lib/api/server-call";

interface AppInput {
  name: string;
  slug: string;
  domain: string;
  courses: boolean;
  community: boolean;
}

export async function createAppAction(input: AppInput): Promise<Refusal | null> {
  return refusable(async () => {
    await Apps.createApp(input, await authHeaders());
    revalidatePath("/settings/apps");
  });
}

export async function updateAppAction(appId: string, input: AppInput): Promise<Refusal | null> {
  return refusable(async () => {
    await Apps.updateApp({ appId, ...input }, await authHeaders());
    revalidatePath("/settings/apps");
  });
}

export async function deleteAppAction(appId: string): Promise<Refusal | null> {
  return refusable(async () => {
    await Apps.deleteApp({ appId }, await authHeaders());
    revalidatePath("/settings/apps");
  });
}
