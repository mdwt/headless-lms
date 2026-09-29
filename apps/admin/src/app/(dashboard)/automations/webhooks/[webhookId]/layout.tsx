import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { requireManager } from "@/lib/auth/server-session";
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

  const webhookPromise = serverApi.getWebhook(webhookId);
  await requireManager(webhookPromise);

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
