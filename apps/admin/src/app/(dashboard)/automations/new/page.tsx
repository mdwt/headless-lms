import { requireManager } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";

import { AutomationEditor } from "../_components/automation-editor";

// New-automation editor: a blank draft over the trigger/action catalogs.
export default async function NewAutomationPage() {
  const dataPromise = Promise.all([serverApi.automationTriggers(), serverApi.automationActions()]);
  await requireManager(dataPromise);
  const [triggers, actions] = await dataPromise;

  return <AutomationEditor automation={null} triggers={triggers} availableActions={actions} />;
}
