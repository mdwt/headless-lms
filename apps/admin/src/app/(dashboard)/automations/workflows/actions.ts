"use server";

// Server actions for workflow mutations (list page + editor).

import { revalidatePath } from "next/cache";
import { Automations, Integrations } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import type { Automation, AutomationAction } from "@/lib/api/types";

export interface SaveAutomationInput {
  name: string;
  description?: string;
  triggers: string[];
  actions: AutomationAction[];
}

export async function createAutomationAction(input: SaveAutomationInput): Promise<Automation> {
  const automation = await Automations.createAutomation(input, await authHeaders());
  revalidatePath("/automations/workflows");
  return automation;
}

export async function updateAutomationAction(
  id: string,
  patch: Partial<SaveAutomationInput> & { enabled?: boolean },
): Promise<Automation> {
  const automation = await Automations.updateAutomation({ id, ...patch }, await authHeaders());
  revalidatePath("/automations/workflows");
  revalidatePath(`/automations/workflows/${id}`);
  return automation;
}

export async function deleteAutomationAction(id: string): Promise<void> {
  await Automations.deleteAutomation({ id }, await authHeaders());
  revalidatePath("/automations/workflows");
}

/** Invoke a connection's listing action (feeds `x-options` pickers in the editor). */
export async function invokeConnectionActionAction(
  connectionId: string,
  actionId: string,
): Promise<Record<string, unknown>> {
  const { output } = await Integrations.invokeConnectionAction(
    { id: connectionId, actionId },
    await authHeaders(),
  );
  return output;
}
