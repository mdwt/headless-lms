"use server";

import { revalidatePath } from "next/cache";
import { Notifications } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import { listRefusal, type ListRefusal } from "@/components/notification-categories/problems";
import type { NotificationCategory } from "@/lib/api/types";

export async function replaceOrgCategoriesAction(
  categories: NotificationCategory[],
): Promise<ListRefusal | null> {
  try {
    await Notifications.replaceOrgNotificationCategories({ categories }, await authHeaders());
  } catch (err) {
    const refusal = listRefusal(err);
    if (refusal) return refusal;
    throw err;
  }
  revalidatePath("/settings/notifications");
  return null;
}

export async function resetOrgCategoriesAction(): Promise<void> {
  await Notifications.resetOrgNotificationCategories(await authHeaders());
  revalidatePath("/settings/notifications");
}
