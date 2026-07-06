import type { ColumnDef } from "@tanstack/react-table";

import { EntitlementStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { NameAvatar } from "@/components/ui/avatar";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ColumnHeader } from "@/components/data-table/column-header";
import { RowActions } from "@/components/data-table/row-actions";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Entitlement } from "@/lib/api/types";

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

/**
 * Column defs for the entitlements list. Revoke/Reinstate row actions are wired
 * to the caller's handlers (the table island owns the mutation + confirm dialog).
 * The page is manager-gated at the server and again in the island, so these
 * actions are only ever rendered for managers.
 */
export function entitlementColumns(
  onRevoke: (entitlement: Entitlement) => void,
  onReinstate: (entitlement: Entitlement) => void,
): ColumnDef<Entitlement, unknown>[] {
  return [
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
        <span className="block max-w-[18rem] truncate text-ink-2">{row.original.courseTitle}</span>
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
      cell: ({ row }) => <span className="text-ink-3">{relativeTime(row.original.grantedAt)}</span>,
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
                <DropdownMenuItem variant="danger" onSelect={() => onRevoke(e)}>
                  Revoke access
                </DropdownMenuItem>
              ) : null}
              {canReinstate ? (
                <>
                  {e.status === "active" ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem onSelect={() => onReinstate(e)}>
                    Reinstate access
                  </DropdownMenuItem>
                </>
              ) : null}
            </RowActions>
          </div>
        );
      },
    },
  ];
}
