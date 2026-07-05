"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ForbiddenView } from "@/components/full-page-states";
import { EntitlementStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NameAvatar } from "@/components/ui/avatar";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { DataTable } from "@/components/data-table/data-table";
import { ColumnHeader } from "@/components/data-table/column-header";
import { RowActions } from "@/components/data-table/row-actions";
import { useDataTable } from "@/components/data-table/use-data-table";
import { useEntitlements, useSetEntitlementStatus } from "@/lib/api/hooks";
import { useCurrentUser } from "@/lib/auth/session-context";
import { isManager } from "@/lib/roles";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Entitlement } from "@/lib/api/types";

import { GrantAccessSheet } from "./_components/grant-access-sheet";

const SOURCE_LABEL: Record<Entitlement["source"], string> = {
  manual: "Manual",
  import: "Import",
};

/** True when an active entitlement lapses within days (warning tone). */
function isExpiringSoon(expiresAt: string | null, status: Entitlement["status"]): boolean {
  if (!expiresAt || status !== "active") return false;
  const rel = relativeTime(expiresAt);
  return rel.startsWith("in ") && /\b(day|hour|minute)s?\b/.test(rel);
}

export default function EntitlementsPage() {
  const user = useCurrentUser();
  const table = useDataTable({ initialSort: [{ id: "grantedAt", desc: true }] });
  const query = useEntitlements(table.params);
  const setStatus = useSetEntitlementStatus();

  const [grantOpen, setGrantOpen] = React.useState(false);
  const [revokeTarget, setRevokeTarget] = React.useState<Entitlement | null>(null);

  const columns = React.useMemo<ColumnDef<Entitlement, unknown>[]>(
    () => [
      {
        accessorKey: "firstName",
        header: ({ column }) => <ColumnHeader column={column} title="Student" />,
        cell: ({ row }) => {
          const e = row.original;
          const name = `${e.firstName} ${e.lastName}`;
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <NameAvatar name={name} className="size-7 shrink-0" />
              <div className="min-w-0">
                <div className="truncate font-medium text-ink">{name}</div>
                <div className="truncate text-sm text-ink-4">{e.studentEmail}</div>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "courseTitle",
        header: ({ column }) => <ColumnHeader column={column} title="Course" />,
        cell: ({ row }) => (
          <span className="block max-w-[18rem] truncate text-ink-2">
            {row.original.courseTitle}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: ({ column }) => <ColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <EntitlementStatusBadge status={row.original.status} />,
        enableSorting: false,
      },
      {
        accessorKey: "source",
        header: ({ column }) => <ColumnHeader column={column} title="Source" />,
        cell: ({ row }) => <Badge variant="outline">{SOURCE_LABEL[row.original.source]}</Badge>,
        enableSorting: false,
      },
      {
        accessorKey: "grantedAt",
        header: ({ column }) => <ColumnHeader column={column} title="Granted" />,
        cell: ({ row }) => (
          <span className="text-ink-3">{relativeTime(row.original.grantedAt)}</span>
        ),
      },
      {
        accessorKey: "expiresAt",
        header: ({ column }) => <ColumnHeader column={column} title="Expires" />,
        cell: ({ row }) => {
          const e = row.original;
          if (!e.expiresAt) return <span className="text-ink-4">Never</span>;
          const soon = isExpiringSoon(e.expiresAt, e.status);
          return (
            <span className={cn("text-ink-3", soon && "font-medium text-warning")}>
              {relativeTime(e.expiresAt)}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: () => null,
        enableSorting: false,
        enableHiding: false,
        meta: { align: "right" },
        cell: ({ row }) => {
          const e = row.original;
          const canReinstate = e.status === "revoked" || e.status === "expired";
          return (
            <div className="flex justify-end">
              <RowActions>
                {e.status === "active" ? (
                  <>
                    <DropdownMenuItem variant="danger" onSelect={() => setRevokeTarget(e)}>
                      Revoke access
                    </DropdownMenuItem>
                  </>
                ) : null}
                {canReinstate ? (
                  <>
                    {e.status === "active" ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem
                      onSelect={() => setStatus.mutate({ id: e.id, action: "reinstate" })}
                    >
                      Reinstate access
                    </DropdownMenuItem>
                  </>
                ) : null}
              </RowActions>
            </div>
          );
        },
      },
    ],
    [setStatus],
  );

  if (!isManager(user.role)) return <ForbiddenView />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Entitlements"
        description="Every grant of course access across your organization — manual or imported."
      />

      <DataTable<Entitlement>
        columns={columns}
        rows={query.data?.rows}
        total={query.data?.total ?? 0}
        state={table}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        isError={query.isError}
        error={query.error}
        refetch={query.refetch}
        getRowId={(r) => r.id}
        searchPlaceholder="Search entitlements…"
        facets={[
          {
            columnId: "status",
            title: "Status",
            options: [
              { label: "Active", value: "active" },
              { label: "Expired", value: "expired" },
              { label: "Revoked", value: "revoked" },
            ],
          },
          {
            columnId: "source",
            title: "Source",
            options: [
              { label: "Manual", value: "manual" },
              { label: "Import", value: "import" },
            ],
          },
        ]}
        toolbarActions={
          <Button variant="primary" size="sm" onClick={() => setGrantOpen(true)}>
            Grant access
          </Button>
        }
        emptyTitle="No entitlements yet"
        emptyDescription="Grant a student access to a course to see it here."
        emptyAction={
          <Button variant="secondary" size="sm" onClick={() => setGrantOpen(true)}>
            Grant access
          </Button>
        }
      />

      <GrantAccessSheet open={grantOpen} onOpenChange={setGrantOpen} />

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        title="Revoke access?"
        description={
          revokeTarget
            ? `${revokeTarget.firstName} ${revokeTarget.lastName} will immediately lose access to ${revokeTarget.courseTitle}. You can reinstate it later.`
            : ""
        }
        confirmLabel="Revoke access"
        destructive
        pending={setStatus.isPending}
        onConfirm={() => {
          if (!revokeTarget) return;
          setStatus.mutate(
            { id: revokeTarget.id, action: "revoke" },
            { onSuccess: () => setRevokeTarget(null) },
          );
        }}
      />
    </div>
  );
}
