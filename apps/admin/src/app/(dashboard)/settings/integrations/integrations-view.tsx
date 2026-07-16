"use client";

import * as React from "react";
import { Blocks, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { IntegrationStatusBadge } from "@/components/status-badge";
import type { AvailableIntegration, IntegrationConnection } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

import { disconnectIntegrationAction } from "./actions";
import { ConnectSheet } from "./_components/connect-sheet";
import { ConfigureSheet } from "./_components/configure-sheet";
import { ReconnectSheet } from "./_components/reconnect-sheet";

export interface IntegrationRow {
  integration: AvailableIntegration;
  connection: IntegrationConnection | null;
}

function rowStatus(row: IntegrationRow) {
  if (!row.connection) return "not_connected" as const;
  return row.connection.active ? ("connected" as const) : ("inactive" as const);
}

/** "stripe" → "Stripe" for display; the id stays the identifier everywhere else. */
function displayName(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

// Integrations view (client): rows come in as props; mutations go through
// server actions from the sheets. One row per available integration.
export function IntegrationsView({ rows }: { rows: IntegrationRow[] }) {
  const [connectTarget, setConnectTarget] = React.useState<IntegrationRow | null>(null);
  const [configureTarget, setConfigureTarget] = React.useState<IntegrationRow | null>(null);
  const [reconnectTarget, setReconnectTarget] = React.useState<IntegrationRow | null>(null);
  const [disconnectTarget, setDisconnectTarget] = React.useState<IntegrationRow | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const confirmDisconnect = React.useCallback(() => {
    const row = disconnectTarget;
    if (!row?.connection) return;
    const id = row.connection.id;
    startTransition(async () => {
      try {
        await disconnectIntegrationAction(id);
        toast.success(`${displayName(row.integration.id)} disconnected`);
        setDisconnectTarget(null);
      } catch (e) {
        toast.error("Couldn't disconnect", { description: (e as Error).message });
      }
    });
  }, [disconnectTarget]);

  return (
    <div className="flex flex-col gap-6">
      {rows.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center">
          <div className="grid size-11 place-items-center rounded-full bg-surface-2 text-ink-3">
            <Blocks className="size-5" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-ink">No integrations available</p>
            <p className="text-sm text-ink-3">
              Integrations declared by this deployment will appear here.
            </p>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="px-4 py-3 text-left font-medium text-ink-3">Integration</th>
                <th className="px-4 py-3 text-left font-medium text-ink-3">Status</th>
                <th className="px-4 py-3 text-left font-medium text-ink-3">Connected</th>
                <th className="px-4 py-3 text-right font-medium text-ink-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr
                  key={row.integration.id}
                  className="bg-surface hover:bg-surface-2 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-ink">
                    {displayName(row.integration.id)}
                  </td>
                  <td className="px-4 py-3">
                    <IntegrationStatusBadge status={rowStatus(row)} />
                  </td>
                  <td className="px-4 py-3 text-ink-3">
                    {row.connection ? formatDate(row.connection.createdAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!row.connection ? (
                      <Button variant="primary" size="sm" onClick={() => setConnectTarget(row)}>
                        Connect
                      </Button>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" aria-label="Connection actions">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setConfigureTarget(row)}>
                            Configure
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setReconnectTarget(row)}>
                            Reconnect
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="danger"
                            onSelect={() => setDisconnectTarget(row)}
                          >
                            Disconnect
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConnectSheet
        row={connectTarget}
        open={!!connectTarget}
        onOpenChange={(o) => !o && setConnectTarget(null)}
      />
      <ConfigureSheet
        row={configureTarget}
        open={!!configureTarget}
        onOpenChange={(o) => !o && setConfigureTarget(null)}
      />
      <ReconnectSheet
        row={reconnectTarget}
        open={!!reconnectTarget}
        onOpenChange={(o) => !o && setReconnectTarget(null)}
      />
      <ConfirmDialog
        open={!!disconnectTarget}
        onOpenChange={(o) => !o && setDisconnectTarget(null)}
        title="Disconnect integration"
        description={
          disconnectTarget
            ? `${displayName(disconnectTarget.integration.id)} will be disconnected and its stored secrets permanently destroyed. You can reconnect at any time with new credentials.`
            : ""
        }
        confirmLabel="Disconnect"
        destructive
        pending={isPending}
        onConfirm={confirmDisconnect}
      />
    </div>
  );
}
