import { notFound } from "next/navigation";

import { requireManager } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { ApiError } from "@/lib/api/http";
import type { Automation, AutomationTriggerInfo, AvailableAction } from "@/lib/api/types";

import { AutomationEditor } from "../_components/automation-editor";

// Editor for an existing automation; catalogs + the automation load in parallel.
export default async function EditAutomationPage({
  params,
}: {
  params: Promise<{ automationId: string }>;
}) {
  const { automationId } = await params;

  const dataPromise = Promise.all([
    serverApi.automationTriggers(),
    serverApi.automationActions(),
    serverApi.getAutomation(automationId),
  ]);
  await requireManager(dataPromise);

  let triggers: AutomationTriggerInfo[];
  let actions: AvailableAction[];
  let automation: Automation;
  try {
    [triggers, actions, automation] = await dataPromise;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return <AutomationEditor automation={automation} triggers={triggers} availableActions={actions} />;
}
