"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { RowActions } from "@/components/data-table/row-actions";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import type { Webhook } from "@/lib/api/types";

import { deleteWebhookAction, updateWebhookAction } from "../../actions";

export function WebhookHeaderActions({ webhook }: { webhook: Webhook }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function onToggleEnabled() {
    const enabled = !webhook.enabled;
    startTransition(async () => {
      try {
        await updateWebhookAction(webhook.id, { enabled });
        toast.success(enabled ? "Webhook enabled" : "Webhook disabled");
        router.refresh();
      } catch (err) {
        toast.error("Couldn't update webhook", { description: (err as Error).message });
      }
    });
  }

  function onConfirmDelete() {
    startTransition(async () => {
      try {
        await deleteWebhookAction(webhook.id);
        toast.success("Webhook deleted");
        router.push("/automations/webhooks");
      } catch (err) {
        toast.error("Couldn't delete webhook", { description: (err as Error).message });
      }
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <RowActions label="Webhook actions">
        <DropdownMenuItem onClick={onToggleEnabled} disabled={isPending}>
          {webhook.enabled ? "Disable" : "Enable"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="danger" onClick={() => setConfirmingDelete(true)}>
          Delete
        </DropdownMenuItem>
      </RowActions>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete webhook?"
        description={
          <>
            Events will stop being sent to{" "}
            <span className="font-medium break-all text-ink">{webhook.url}</span> and its signing
            secret is destroyed. Past deliveries are kept for auditing.
          </>
        }
        confirmLabel="Delete webhook"
        destructive
        pending={isPending}
        onConfirm={onConfirmDelete}
      />
    </div>
  );
}
