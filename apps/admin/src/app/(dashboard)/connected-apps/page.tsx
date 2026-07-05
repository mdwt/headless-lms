"use client";

import * as React from "react";
import { Loader2, Plug } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useConnectedApps, useRevokeConnectedApp } from "@/lib/api/hooks";
import type { ConnectedApp } from "@/lib/api/hooks";
import { formatDate } from "@/lib/format";

export default function ConnectedAppsPage() {
  const { data: apps, isLoading, isError } = useConnectedApps();
  const revoke = useRevokeConnectedApp();
  const [revokeTarget, setRevokeTarget] = React.useState<ConnectedApp | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Connected Apps"
        description="Apps and MCP clients you have authorized to access your account. Revoking removes their access immediately."
      />

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-ink-3">
          <Loader2 className="size-4 animate-spin" />
          Loading connected apps…
        </div>
      )}

      {isError && (
        <p className="text-sm text-danger">
          Failed to load connected apps. Please refresh the page.
        </p>
      )}

      {!isLoading && !isError && apps !== undefined && apps.length === 0 && (
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

      {apps && apps.length > 0 && (
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
        pending={revoke.isPending}
        onConfirm={() => {
          if (!revokeTarget) return;
          revoke.mutate(revokeTarget.id, { onSuccess: () => setRevokeTarget(null) });
        }}
      />
    </div>
  );
}
