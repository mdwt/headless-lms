import { requireManager } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { SettingsSurface } from "@/components/forms/settings-section";

import { WebhookSettingsForm } from "./_components/webhook-settings-form";
import { SigningSecretSection } from "./_components/signing-secret-section";

export default async function WebhookSettingsPage({
  params,
}: {
  params: Promise<{ webhookId: string }>;
}) {
  const { webhookId } = await params;

  const dataPromise = Promise.all([
    serverApi.getWebhook(webhookId),
    serverApi.automationTriggers(),
  ]);
  await requireManager(dataPromise);
  const [webhook, triggers] = await dataPromise;

  return (
    <SettingsSurface>
      <WebhookSettingsForm webhook={webhook} triggers={triggers} />
      <SigningSecretSection webhookId={webhook.id} />
    </SettingsSurface>
  );
}
