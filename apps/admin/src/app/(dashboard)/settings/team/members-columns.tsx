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
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ItemRoleBadges, MemberStatusBadge, RoleBadge } from "@/components/status-badge";
import { ColumnHeader } from "@/components/data-table/column-header";
import { RowActions } from "@/components/data-table/row-actions";
import { fullName, relativeTime } from "@/lib/format";
import type { Member, OrgRole } from "@/lib/api/types";

function RoleCell({
  member,
  editable,
  roles,
  team,
  onChange,
}: {
  member: Member;
  editable: boolean;
  roles: OrgRole[];
  team: boolean;
  onChange: (member: Member, roleKey: string) => void;
}) {
  if (!editable || roles.length === 0) {
    return <RoleBadge name={member.orgRole.name} isOwner={member.isOwner} team={team} />;
  }

  return (
    <Select value={member.orgRole.key} onValueChange={(roleKey) => onChange(member, roleKey)}>
      <SelectTrigger
        size="sm"
        className="w-[11rem]"
        aria-label={`Change org role for ${fullName(member)}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => (
          <SelectItem key={r.key} value={r.key}>
            {r.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function memberColumns({
  canSetRole,
  canInvite,
  canRemove,
  currentUserEmail,
  roles,
  teamRoleKeys,
  titles,
  onRemove,
  onChangeRole,
  onResend,
  onCancelInvite,
}: {
  canSetRole: boolean;
  canInvite: boolean;
  canRemove: boolean;
  /** Matched on rather than an id: `Member.id` is the org_users row, while the
   *  session carries the auth account id — the two never compare equal. */
  currentUserEmail: string;
  roles: OrgRole[];
  teamRoleKeys: Set<string>;
  titles: Record<string, string>;
  onRemove: (member: Member) => void;
  onChangeRole: (member: Member, roleKey: string) => void;
  onResend: (member: Member) => void;
  onCancelInvite: (member: Member) => void;
}): ColumnDef<Member, unknown>[] {
  const isSelf = (m: Member) => m.email.toLowerCase() === currentUserEmail.toLowerCase();
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
            <NameAvatar name={fullName(m)} image={m.image} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-ink">{fullName(m)}</span>
              <span className="truncate text-xs text-ink-3">{m.email}</span>
            </div>
          </div>
        );
      },
    },
    {
      id: "roleKey",
      header: ({ column }) => <ColumnHeader column={column} title="Org role" />,
      enableSorting: false,
      cell: ({ row }) => {
        const m = row.original;
        return (
          <RoleCell
            member={m}
            editable={canSetRole && !m.isOwner && !isSelf(m)}
            roles={roles}
            team={teamRoleKeys.has(m.orgRole.key)}
            onChange={onChangeRole}
          />
        );
      },
    },
    {
      id: "items",
      header: ({ column }) => <ColumnHeader column={column} title="Roles on items" />,
      enableSorting: false,
      cell: ({ row }) => <ItemRoleBadges items={row.original.items} titles={titles} />,
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
        const invited = m.status === "invited" && canInvite;
        const removable = canRemove && !m.isOwner && !isSelf(m);
        if (!invited && !removable) return null;
        return (
          <RowActions label={`Actions for ${fullName(m)}`}>
            {invited ? (
              <>
                <DropdownMenuItem onSelect={() => onResend(m)}>Resend invite</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onCancelInvite(m)}>
                  Cancel invite
                </DropdownMenuItem>
              </>
            ) : null}
            {invited && removable ? <DropdownMenuSeparator /> : null}
            {removable ? (
              <DropdownMenuItem
                variant="danger"
                onSelect={(e) => {
                  e.preventDefault();
                  onRemove(m);
                }}
              >
                Remove from org
              </DropdownMenuItem>
            ) : null}
          </RowActions>
        );
      },
    },
  ];
}
