import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { EnabledBadge } from "@/components/status-badge";
import type { Webhook } from "@/lib/api/types";
import { relativeTime } from "@/lib/format";

import { WebhookHeaderActions } from "./webhook-header-actions";
import { WebhookTabsNav } from "./webhook-tabs-nav";

export function WebhookHeader({ webhook }: { webhook: Webhook }) {
  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/automations/webhooks"
        className="inline-flex w-fit items-center gap-1 rounded-md text-sm text-ink-3 outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <ChevronLeft className="size-4" />
        Webhooks
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-xl font-semibold tracking-tight break-all text-ink">{webhook.url}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-3">
            <EnabledBadge enabled={webhook.enabled} />
            {webhook.description ? <p>{webhook.description}</p> : null}
            <p className="text-xs">Updated {relativeTime(webhook.updatedAt)}</p>
          </div>
        </div>
        <WebhookHeaderActions webhook={webhook} />
      </div>

      <WebhookTabsNav webhookId={webhook.id} />
    </div>
  );
}
