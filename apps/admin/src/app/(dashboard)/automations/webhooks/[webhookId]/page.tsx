import { redirect } from "next/navigation";

export default async function WebhookIndex({ params }: { params: Promise<{ webhookId: string }> }) {
  const { webhookId } = await params;
  redirect(`/automations/webhooks/${webhookId}/settings`);
}
