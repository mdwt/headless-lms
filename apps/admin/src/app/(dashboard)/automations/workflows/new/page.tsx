import { requirePermission } from "@/lib/auth/server-permissions";
import { serverApi } from "@/lib/api/server";

import { AutomationEditor } from "../_components/automation-editor";

// New-automation editor: a blank draft over the trigger/action catalogs.
export default async function NewAutomationPage() {
  await requirePermission("automations:write");
  const dataPromise = Promise.all([
    serverApi.automationTriggers(),
    serverApi.automationActions(),
    serverApi.listConnections(),
  ]);
  const [triggers, actions, connections] = await dataPromise;

  return (
    <AutomationEditor
      automation={null}
      triggers={triggers}
      availableActions={actions}
      connections={connections}
    />
  );
}
