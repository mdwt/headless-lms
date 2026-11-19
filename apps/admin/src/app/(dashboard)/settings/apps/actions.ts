"use server";

import { revalidatePath } from "next/cache";
import { Apps } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import type { OrgApp } from "@/lib/api/types";

export interface AppInput {
  name: string;
  slug: string;
  domain: string;
  courses: boolean;
  community: boolean;
}

export async function createAppAction(input: AppInput): Promise<OrgApp> {
  const app = await Apps.createApp(input, await authHeaders());
  revalidatePath("/settings/apps");
  return app;
}

export async function updateAppAction(appId: string, input: AppInput): Promise<OrgApp> {
  const app = await Apps.updateApp({ appId, ...input }, await authHeaders());
  revalidatePath("/settings/apps");
  return app;
}

export async function deleteAppAction(appId: string): Promise<void> {
  await Apps.deleteApp({ appId }, await authHeaders());
  revalidatePath("/settings/apps");
}
