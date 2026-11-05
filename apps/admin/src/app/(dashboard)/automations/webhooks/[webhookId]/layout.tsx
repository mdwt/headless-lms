import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/auth/server-permissions";
import { serverApi } from "@/lib/api/server";
import { ApiError } from "@/lib/api/http";
import type { Webhook } from "@/lib/api/types";

import { WebhookHeader } from "./_components/webhook-header";

export default async function WebhookLayout({
  params,
  children,
}: {
  params: Promise<{ webhookId: string }>;
  children: ReactNode;
}) {
  const { webhookId } = await params;

  await requirePermission("automations:read");

  const webhookPromise = serverApi.getWebhook(webhookId);

  let webhook: Webhook;
  try {
    webhook = await webhookPromise;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="flex flex-col gap-8">
      <WebhookHeader webhook={webhook} />
      {children}
    </div>
  );
}
