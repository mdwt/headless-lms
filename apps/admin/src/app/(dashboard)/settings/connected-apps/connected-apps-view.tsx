"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingRow, SettingsSection, SettingsSurface } from "@/components/forms/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ConnectedApp } from "@/lib/api/types";
import { API_URL } from "@/lib/auth/client";
import { formatDate } from "@/lib/format";

import { revokeConnectedAppAction } from "./actions";

export function ConnectedAppsView({ apps }: { apps: ConnectedApp[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<ConnectedApp | null>(null);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    if (!target) return;
    const clientId = target.clientId;
    startTransition(async () => {
      try {
        await revokeConnectedAppAction(clientId);
        toast.success("Disconnected");
        setTarget(null);
        router.refresh();
      } catch (err) {
        toast.error("Couldn't disconnect", { description: (err as Error).message });
      }
    });
  }

  return (
    <SettingsSurface>
      <SettingsSection
        title="Connected apps"
        description="Apps that act in this organization as you, such as ChatGPT or Claude. Disconnecting signs the app out immediately."
      >
        {apps.length === 0 ? (
          <p className="text-sm text-ink-3">
            No apps connected. Add <span className="font-mono text-ink-2">{`${API_URL}/mcp`}</span>{" "}
            as a connector in ChatGPT or Claude.
          </p>
        ) : (
          apps.map((app) => (
            <div key={app.clientId} className="flex flex-col gap-2">
              <SettingRow
                id={`app-${app.clientId}`}
                label={app.name}
                hint={`Connected ${formatDate(app.connectedAt)}`}
              >
                <Button variant="ghost" onClick={() => setTarget(app)}>
                  Disconnect
                </Button>
              </SettingRow>
              <div className="flex flex-wrap gap-1.5">
                {app.scopes.map((scope) => (
                  <Badge key={scope} variant="outline" className="font-mono">
                    {scope}
                  </Badge>
                ))}
              </div>
            </div>
          ))
        )}
      </SettingsSection>

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title={`Disconnect ${target?.name ?? "app"}?`}
        description="The app is signed out immediately and can no longer act as you in this organization."
        confirmLabel="Disconnect"
        destructive
        pending={pending}
        onConfirm={onConfirm}
      />
    </SettingsSurface>
  );
}
