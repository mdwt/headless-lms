"use server";

import { revalidatePath } from "next/cache";
import { Apps } from "@headless-lms/sdk";

import { refusalOf, type Refusal } from "@/lib/api/refusal";
import { authHeaders } from "@/lib/api/server-call";

export interface AppInput {
  name: string;
  slug: string;
  domain: string;
  courses: boolean;
  community: boolean;
}

export async function createAppAction(input: AppInput): Promise<Refusal | null> {
  try {
    await Apps.createApp(input, await authHeaders());
  } catch (err) {
    const refusal = refusalOf(err);
    if (refusal) return refusal;
    throw err;
  }
  revalidatePath("/settings/apps");
  return null;
}

export async function updateAppAction(appId: string, input: AppInput): Promise<Refusal | null> {
  try {
    await Apps.updateApp({ appId, ...input }, await authHeaders());
  } catch (err) {
    const refusal = refusalOf(err);
    if (refusal) return refusal;
    throw err;
  }
  revalidatePath("/settings/apps");
  return null;
}

export async function deleteAppAction(appId: string): Promise<Refusal | null> {
  try {
    await Apps.deleteApp({ appId }, await authHeaders());
  } catch (err) {
    const refusal = refusalOf(err);
    if (refusal) return refusal;
    throw err;
  }
  revalidatePath("/settings/apps");
  return null;
}
