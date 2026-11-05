import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/auth/server-permissions";
import { serverApi } from "@/lib/api/server";
import { ApiError } from "@/lib/api/http";
import type {
  Automation,
  AutomationTriggerInfo,
  AvailableAction,
  IntegrationConnection,
} from "@/lib/api/types";

import { AutomationEditor } from "../_components/automation-editor";

// Editor for an existing automation; catalogs + the automation load in parallel.
export default async function EditAutomationPage({
  params,
}: {
  params: Promise<{ automationId: string }>;
}) {
  const { automationId } = await params;

  await requirePermission("automations:read");

  const dataPromise = Promise.all([
    serverApi.automationTriggers(),
    serverApi.automationActions(),
    serverApi.getAutomation(automationId),
    serverApi.listConnections(),
  ]);

  let triggers: AutomationTriggerInfo[];
  let actions: AvailableAction[];
  let automation: Automation;
  let connections: IntegrationConnection[];
  try {
    [triggers, actions, automation, connections] = await dataPromise;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <AutomationEditor
      automation={automation}
      triggers={triggers}
      availableActions={actions}
      connections={connections}
    />
  );
}
