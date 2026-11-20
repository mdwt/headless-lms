"use server";

import { revalidatePath } from "next/cache";
import { Apps } from "@headless-lms/sdk";

import type { ApiError } from "@/lib/api/http";
import { authHeaders } from "@/lib/api/server-call";

export interface AppInput {
  name: string;
  slug: string;
  domain: string;
  courses: boolean;
  community: boolean;
}

export type AppRefusal = { refused: string };

function appRefusal(err: unknown): AppRefusal | null {
  const status = (err as Partial<ApiError> | null)?.status;
  return status === 409 && err instanceof Error ? { refused: err.message } : null;
}

export async function createAppAction(input: AppInput): Promise<AppRefusal | null> {
  try {
    await Apps.createApp(input, await authHeaders());
  } catch (err) {
    const refusal = appRefusal(err);
    if (refusal) return refusal;
    throw err;
  }
  revalidatePath("/settings/apps");
  return null;
}

export async function updateAppAction(appId: string, input: AppInput): Promise<AppRefusal | null> {
  try {
    await Apps.updateApp({ appId, ...input }, await authHeaders());
  } catch (err) {
    const refusal = appRefusal(err);
    if (refusal) return refusal;
    throw err;
  }
  revalidatePath("/settings/apps");
  return null;
}

export async function deleteAppAction(appId: string): Promise<void> {
  await Apps.deleteApp({ appId }, await authHeaders());
  revalidatePath("/settings/apps");
}
