"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingRow, SettingsSection, SettingsSurface } from "@/components/forms/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApiKeySummary } from "@/lib/api/types";
import type { PermissionDefinition } from "@/lib/permissions";
import { formatDate } from "@/lib/format";

import { deleteApiKeyAction } from "./actions";
import { CreateApiKeyDialog } from "./create-api-key-dialog";

export function ApiKeysView({
  keys,
  permissions,
  catalogue,
  canCreate,
  canRevoke,
}: {
  keys: ApiKeySummary[];
  permissions: PermissionDefinition[];
  catalogue: PermissionDefinition[];
  canCreate: boolean;
  canRevoke: boolean;
}) {
  const labels = new Map(catalogue.map((p) => [p.key as string, p.label]));
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
        description="Keys for scripts and agents that call this server's /mcp endpoint with the key sent as Authorization: Bearer <key> or in the x-api-key header. A key acts as you in this organization."
        footer={
          canCreate && permissions.length > 0 ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              Create key
            </Button>
          ) : undefined
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
              {canRevoke ? (
                <Button variant="ghost" onClick={() => setTarget(key)}>
                  Delete
                </Button>
              ) : null}
            </SettingRow>
            <div className="flex flex-wrap gap-1.5">
              {key.scopes.map((scope) => (
                <Badge key={scope} variant="outline" title={scope}>
                  {labels.get(scope) ?? scope}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </SettingsSection>

      {canCreate ? (
        <CreateApiKeyDialog open={creating} onOpenChange={setCreating} permissions={permissions} />
      ) : null}

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
