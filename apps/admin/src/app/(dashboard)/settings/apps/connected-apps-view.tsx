"use client";

import * as React from "react";
import { Plug } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ConnectedApp } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

import { revokeConnectedAppAction } from "./actions";

// Connected apps view (client): apps come in as props; revoke goes through a server action.
export function ConnectedAppsView({ apps }: { apps: ConnectedApp[] }) {
  const [revokeTarget, setRevokeTarget] = React.useState<ConnectedApp | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const confirmRevoke = React.useCallback(() => {
    if (!revokeTarget) return;
    const app = revokeTarget;
    startTransition(async () => {
      try {
        await revokeConnectedAppAction(app.id);
        toast.success("Access revoked");
        setRevokeTarget(null);
      } catch (e) {
        toast.error("Couldn't revoke access", { description: (e as Error).message });
      }
    });
  }, [revokeTarget]);

  return (
    <div className="flex flex-col gap-6">
      {apps.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center">
          <div className="grid size-11 place-items-center rounded-full bg-surface-2 text-ink-3">
            <Plug className="size-5" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-ink">No connected apps</p>
            <p className="text-sm text-ink-3">Apps authorized via MCP or OAuth will appear here.</p>
          </div>
        </div>
      )}

      {apps.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="px-4 py-3 text-left font-medium text-ink-3">App</th>
                <th className="px-4 py-3 text-left font-medium text-ink-3">Scopes</th>
                <th className="px-4 py-3 text-left font-medium text-ink-3">Authorized</th>
                <th className="px-4 py-3 text-left font-medium text-ink-3">Expires</th>
                <th className="px-4 py-3 text-right font-medium text-ink-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {apps.map((app) => (
                <tr key={app.id} className="bg-surface hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3 font-medium text-ink">{app.clientName}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {app.scopes.map((scope) => (
                        <Badge key={scope} variant="neutral" className="font-mono text-xs">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-3">{formatDate(app.createdAt)}</td>
                  <td className="px-4 py-3 text-ink-3">
                    {app.expiresAt ? formatDate(app.expiresAt) : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="destructive" size="sm" onClick={() => setRevokeTarget(app)}>
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        title="Revoke access"
        description={
          revokeTarget
            ? `${revokeTarget.clientName} will lose access immediately. You can re-authorize the app at any time.`
            : ""
        }
        confirmLabel="Revoke"
        destructive
        pending={isPending}
        onConfirm={confirmRevoke}
      />
    </div>
  );
}
