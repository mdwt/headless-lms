"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingRow, SettingsSection, SettingsSurface } from "@/components/forms/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AccessScope, ApiKeySummary } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

import { deleteApiKeyAction } from "./actions";
import { CreateApiKeyDialog } from "./create-api-key-dialog";

export function ApiKeysView({ keys, scopes }: { keys: ApiKeySummary[]; scopes: AccessScope[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [target, setTarget] = useState<ApiKeySummary | null>(null);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    if (!target) return;
    const id = target.id;
    startTransition(async () => {
      try {
        await deleteApiKeyAction(id);
        toast.success("API key deleted");
        setTarget(null);
        router.refresh();
      } catch (err) {
        toast.error("Couldn't delete the key", { description: (err as Error).message });
      }
    });
  }

  return (
    <SettingsSurface>
      <SettingsSection
        title="API keys"
        description="Keys for scripts and agents that call this server's /mcp endpoint with an x-api-key header. A key acts as you in this organization."
        footer={
          <Button variant="primary" onClick={() => setCreating(true)}>
            Create key
          </Button>
        }
      >
        {keys.map((key) => (
          <div key={key.id} className="flex flex-col gap-2">
            <SettingRow
              id={`key-${key.id}`}
              label={key.name ?? "Untitled key"}
              hint={`${key.start ? `${key.start}… · ` : ""}Created ${formatDate(key.createdAt)} · ${
                key.lastUsedAt ? `Last used ${formatDate(key.lastUsedAt)}` : "Never used"
              }`}
            >
              <Button variant="ghost" onClick={() => setTarget(key)}>
                Delete
              </Button>
            </SettingRow>
            <div className="flex flex-wrap gap-1.5">
              {key.scopes.map((scope) => (
                <Badge key={scope} variant="outline" className="font-mono">
                  {scope}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </SettingsSection>

      <CreateApiKeyDialog open={creating} onOpenChange={setCreating} scopes={scopes} />

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title={`Delete ${target?.name ?? "this key"}?`}
        description="Anything using this key stops working immediately."
        confirmLabel="Delete key"
        destructive
        pending={pending}
        onConfirm={onConfirm}
      />
    </SettingsSurface>
  );
}
