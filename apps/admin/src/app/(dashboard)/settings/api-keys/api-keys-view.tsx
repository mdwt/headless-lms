"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingRow, SettingsSection, SettingsSurface } from "@/components/forms/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApiKeyRole, ApiKeySummary } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

import { deleteApiKeyAction } from "./actions";
import { CreateApiKeyDialog } from "./create-api-key-dialog";

function expiryOf(key: ApiKeySummary): string {
  if (!key.expiresAt) return "Never expires";
  const expired = new Date(key.expiresAt).getTime() <= Date.now();
  return `${expired ? "Expired" : "Expires"} ${formatDate(key.expiresAt)}`;
}

export function ApiKeysView({
  keys,
  roles,
  canCreate,
  canRevoke,
}: {
  keys: ApiKeySummary[];
  roles: ApiKeyRole[];
  canCreate: boolean;
  canRevoke: boolean;
}) {
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
        description="Keys for servers, scripts and agents that call this API or its /mcp endpoint, sent as Authorization: Bearer <key> or in the x-api-key header. A key acts as you in this organization with its role's permissions, never more than you hold."
        footer={
          canCreate && roles.length > 0 ? (
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
              } · ${expiryOf(key)}`}
            >
              {canRevoke ? (
                <Button variant="ghost" onClick={() => setTarget(key)}>
                  Delete
                </Button>
              ) : null}
            </SettingRow>
            {key.role ? (
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" title={key.role.key}>
                  {key.role.name ?? "Deleted role"}
                </Badge>
              </div>
            ) : null}
          </div>
        ))}
      </SettingsSection>

      {canCreate ? (
        <CreateApiKeyDialog open={creating} onOpenChange={setCreating} roles={roles} />
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
