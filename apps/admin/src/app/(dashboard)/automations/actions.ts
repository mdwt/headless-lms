"use server";

// Server actions for automation mutations (list page + editor).

import { revalidatePath } from "next/cache";
import { Automations } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, unwrap, expectOk } from "@/lib/api/server-call";
import type { Automation, AutomationAction } from "@/lib/api/types";

export interface SaveAutomationInput {
  name: string;
  description?: string;
  trigger: string;
  actions: AutomationAction[];
}

export async function createAutomationAction(input: SaveAutomationInput): Promise<Automation> {
  ensureConfigured();
  const automation = unwrap(
    await Automations.createAutomation({ body: input, ...(await authHeaders()) }),
  );
  revalidatePath("/automations");
  return automation;
}

export async function updateAutomationAction(
  id: string,
  patch: Partial<SaveAutomationInput> & { enabled?: boolean },
): Promise<Automation> {
  ensureConfigured();
  const automation = unwrap(
    await Automations.updateAutomation({ path: { id }, body: patch, ...(await authHeaders()) }),
  );
  revalidatePath("/automations");
  revalidatePath(`/automations/${id}`);
  return automation;
}

export async function deleteAutomationAction(id: string): Promise<void> {
  ensureConfigured();
  expectOk(await Automations.deleteAutomation({ path: { id }, ...(await authHeaders()) }));
  revalidatePath("/automations");
}
