"use server";

import { revalidatePath } from "next/cache";
import { Automations } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import type { AutomationRun, Webhook } from "@/lib/api/types";

export interface SaveWebhookInput {
  url: string;
  events: string[];
  description?: string;
}

function revalidateWebhooks(id?: string): void {
  revalidatePath("/automations/webhooks");
  if (id) revalidatePath(`/automations/webhooks/${id}`, "layout");
}

export async function createWebhookAction(input: SaveWebhookInput): Promise<Webhook> {
  const { secret: _secret, ...webhook } = await Automations.createWebhook(
    input,
    await authHeaders(),
  );
  revalidateWebhooks();
  return webhook;
}

export async function updateWebhookAction(
  id: string,
  patch: Partial<SaveWebhookInput> & { enabled?: boolean },
): Promise<Webhook> {
  const webhook = await Automations.updateWebhook({ id, ...patch }, await authHeaders());
  revalidateWebhooks(id);
  return webhook;
}

export async function deleteWebhookAction(id: string): Promise<void> {
  await Automations.deleteWebhook({ id }, await authHeaders());
  revalidateWebhooks();
}

export async function revealWebhookSecretAction(id: string): Promise<string> {
  const { secret } = await Automations.getWebhookSecret({ id }, await authHeaders());
  return secret;
}

export async function rotateWebhookSecretAction(id: string): Promise<string> {
  const { secret } = await Automations.rotateWebhookSecret({ id }, await authHeaders());
  return secret;
}

export async function resendDeliveryAction(id: string, runId: string): Promise<AutomationRun> {
  const run = await Automations.rerunAutomationRun({ id, runId }, await authHeaders());
  revalidatePath(`/automations/webhooks/${id}/deliveries`);
  return run;
}
