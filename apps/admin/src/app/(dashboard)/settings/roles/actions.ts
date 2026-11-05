"use server";

import { revalidatePath } from "next/cache";
import { Roles } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";

export async function renameRoleAction(input: {
  key: string;
  name: string;
  description: string;
}): Promise<void> {
  await Roles.updateRole(input, await authHeaders());
  revalidatePath("/", "layout");
}
