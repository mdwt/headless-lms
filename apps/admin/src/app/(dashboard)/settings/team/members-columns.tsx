"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { NameAvatar } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { MemberStatusBadge, RoleBadge } from "@/components/status-badge";
import { ColumnHeader } from "@/components/data-table/column-header";
import { RowActions } from "@/components/data-table/row-actions";
import { relativeTime } from "@/lib/format";
import type { Member, Role } from "@/lib/api/types";

/** Roles a manager may assign to an existing member — never owner (that's fixed). */
const ASSIGNABLE_ROLES = [
  { label: "Admin", value: "admin" },
  { label: "Instructor", value: "instructor" },
] as const;

/**
 * Inline role control. Owners are fixed (badge only, never editable); when the
 * viewer can't manage roles we also fall back to a read-only badge. The change
 * is optimistic — the island applies `useOptimistic` and calls the Server Action.
 */
function RoleCell({
  member,
  editable,
  onChange,
}: {
  member: Member;
  editable: boolean;
  onChange: (id: string, role: Role) => void;
}) {
  if (!editable || member.role === "owner") {
    return <RoleBadge role={member.role} />;
  }

  return (
    <Select
      value={member.role}
      onValueChange={(role) => onChange(member.id, role as Role)}
    >
      <SelectTrigger size="sm" className="w-[9.5rem]" aria-label={`Change role for ${member.name}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ASSIGNABLE_ROLES.map((r) => (
          <SelectItem key={r.value} value={r.value}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function memberColumns({
  canManageRoles,
  currentUserId,
  onRemove,
  onChangeRole,
}: {
  canManageRoles: boolean;
  currentUserId: string;
  onRemove: (member: Member) => void;
  onChangeRole: (id: string, role: Role) => void;
}): ColumnDef<Member, unknown>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: ({ column }) => <ColumnHeader column={column} title="Member" />,
      enableSorting: true,
      enableHiding: false,
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div className="flex items-center gap-3">
            <NameAvatar name={m.name} image={m.image} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-ink">{m.name}</span>
              <span className="truncate text-xs text-ink-3">{m.email}</span>
            </div>
          </div>
        );
      },
    },
    {
      id: "role",
      accessorKey: "role",
      header: ({ column }) => <ColumnHeader column={column} title="Role" />,
      enableSorting: false,
      cell: ({ row }) => (
        <RoleCell member={row.original} editable={canManageRoles} onChange={onChangeRole} />
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => <ColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <MemberStatusBadge status={row.original.status} />,
    },
    {
      id: "joinedAt",
      accessorKey: "joinedAt",
      header: ({ column }) => <ColumnHeader column={column} title="Joined" />,
      cell: ({ row }) => <span className="text-ink-3">{relativeTime(row.original.joinedAt)}</span>,
    },
    {
      id: "invitedAt",
      accessorKey: "invitedAt",
      header: ({ column }) => <ColumnHeader column={column} title="Invited" />,
      cell: ({ row }) => (
        <span className="text-ink-3">
          {row.original.status === "invited" ? relativeTime(row.original.invitedAt) : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      enableHiding: false,
      meta: { align: "right" },
      cell: ({ row }) => {
        const m = row.original;
        const isOwner = m.role === "owner";
        const isSelf = m.id === currentUserId;
        // Owners are fixed and can never be removed; nor can you remove yourself.
        const disabledRemove = isOwner || isSelf;
        return (
          <RowActions label={`Actions for ${m.name}`}>
            <DropdownMenuItem
              variant="danger"
              disabled={disabledRemove}
              onSelect={(e) => {
                e.preventDefault();
                if (!disabledRemove) onRemove(m);
              }}
            >
              Remove from org
            </DropdownMenuItem>
          </RowActions>
        );
      },
    },
  ];
}
