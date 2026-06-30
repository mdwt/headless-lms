"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { UserPlus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ForbiddenView } from "@/components/full-page-states";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
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
import { DataTable } from "@/components/data-table/data-table";
import { ColumnHeader } from "@/components/data-table/column-header";
import { RowActions } from "@/components/data-table/row-actions";
import { useDataTable } from "@/components/data-table/use-data-table";
import {
  useMembers,
  useUpdateMemberRole,
  useRemoveMember,
} from "@/lib/api/hooks";
import { useCurrentUser } from "@/lib/auth/session-context";
import { isManager, can } from "@/lib/roles";
import { relativeTime } from "@/lib/format";
import type { Member, Role } from "@/lib/api/types";
import { InviteSheet } from "./_components/invite-sheet";

const ROLE_FACETS = [
  { label: "Owner", value: "owner" },
  { label: "Admin", value: "admin" },
  { label: "Instructor", value: "instructor" },
];

const STATUS_FACETS = [
  { label: "Active", value: "active" },
  { label: "Invited", value: "invited" },
];

/** Roles a manager may assign to an existing member (never owner — that's fixed). */
const ASSIGNABLE_ROLES = [
  { label: "Admin", value: "admin" },
  { label: "Instructor", value: "instructor" },
] as const;

/**
 * Inline role control. Owners are fixed (badge only); when the viewer can't
 * manage roles we also fall back to a read-only badge.
 */
function RoleCell({ member, editable }: { member: Member; editable: boolean }) {
  const updateRole = useUpdateMemberRole();

  if (!editable || member.role === "owner") {
    return <RoleBadge role={member.role} />;
  }

  return (
    <Select
      value={member.role}
      onValueChange={(role) => updateRole.mutate({ id: member.id, role: role as Role })}
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

export default function MembersPage() {
  const user = useCurrentUser();
  const state = useDataTable({ pageSize: 10, initialSort: [{ id: "status", desc: false }] });
  const { data, isLoading, isFetching, isError, error, refetch } = useMembers(state.params);

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [removeTarget, setRemoveTarget] = React.useState<Member | null>(null);
  const removeMember = useRemoveMember();

  const canManageRoles = can.manageRoles(user);
  const canInvite = can.inviteMembers(user);

  // Guard deep-links even though nav hides this for non-managers.
  if (!isManager(user.role)) return <ForbiddenView />;

  const columns: ColumnDef<Member, unknown>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: ({ column }) => <ColumnHeader column={column} title="Member" />,
      enableSorting: true,
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
      cell: ({ row }) => <RoleCell member={row.original} editable={canManageRoles} />,
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
      cell: ({ row }) => (
        <span className="text-ink-3">{relativeTime(row.original.joinedAt)}</span>
      ),
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
        const isSelf = m.id === user.id;
        const disabledRemove = isOwner || isSelf;
        return (
          <RowActions label={`Actions for ${m.name}`}>
            <DropdownMenuItem
              variant="danger"
              disabled={disabledRemove}
              onSelect={(e) => {
                e.preventDefault();
                if (!disabledRemove) setRemoveTarget(m);
              }}
            >
              Remove from org
            </DropdownMenuItem>
          </RowActions>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Members"
        description="Manage who can access the back office and what they can do."
      />

      <DataTable<Member>
        columns={columns}
        rows={data?.rows}
        total={data?.total ?? 0}
        state={state}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        error={error}
        refetch={refetch}
        getRowId={(m) => m.id}
        searchPlaceholder="Search by name or email…"
        facets={[
          { columnId: "role", title: "Role", options: ROLE_FACETS },
          { columnId: "status", title: "Status", options: STATUS_FACETS },
        ]}
        toolbarActions={
          canInvite ? (
            <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus />
              Invite member
            </Button>
          ) : undefined
        }
        emptyTitle="No members found"
        emptyDescription="Invite teammates to help manage courses and students."
        emptyAction={
          canInvite ? (
            <Button variant="secondary" size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus />
              Invite member
            </Button>
          ) : undefined
        }
      />

      {canInvite ? <InviteSheet open={inviteOpen} onOpenChange={setInviteOpen} /> : null}

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title="Remove member"
        description={
          removeTarget
            ? `${removeTarget.name} will lose access to this organization. This can't be undone, but they can be invited again.`
            : ""
        }
        confirmLabel="Remove member"
        destructive
        pending={removeMember.isPending}
        onConfirm={() => {
          if (!removeTarget) return;
          removeMember.mutate(removeTarget.id, { onSuccess: () => setRemoveTarget(null) });
        }}
      />
    </div>
  );
}
