"use client";

import { Suspense, useCallback, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/components/data-table/use-data-table";
import { useCurrentUser } from "@/lib/auth/session-context";
import { usePermissions } from "@/lib/auth/permissions-context";
import type { Member, ListParams, OrgRole } from "@/lib/api/types";
import { fullName } from "@/lib/format";
import { givableOrgRoles, teamRoleKeys } from "@/lib/org-roles";

import { memberColumns } from "./members-columns";
import { InviteDialog } from "./_components/invite-dialog";
import {
  cancelInviteAction,
  removePersonAction,
  resendInviteAction,
  setOrgRoleAction,
} from "./actions";

const STATUS_FACETS = [
  { label: "Active", value: "active" },
  { label: "Invited", value: "invited" },
];

function sameParams(a: ListParams, b: ListParams): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function MembersTableInner({
  rows,
  total,
  params,
  roles,
  titles,
}: {
  rows: Member[];
  total: number;
  params: ListParams;
  roles: OrgRole[];
  titles: Record<string, string>;
}) {
  const router = useRouter();
  const user = useCurrentUser();
  const permissions = usePermissions();

  const state = useDataTable({ pageSize: params.pageSize, initialSort: params.sort });
  const isStale = !sameParams(state.params, params);

  const [optimisticRows, applyOptimistic] = useOptimistic(
    rows,
    (rowsState: Member[], patch: { id: string; orgRole: Member["orgRole"] }) =>
      rowsState.map((m) => (m.id === patch.id ? { ...m, orgRole: patch.orgRole } : m)),
  );

  const [isPending, startTransition] = useTransition();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Member | null>(null);

  const orgRoles = useMemo(() => givableOrgRoles(roles), [roles]);
  const teamKeys = useMemo(() => teamRoleKeys(roles), [roles]);
  const canWrite = permissions.has("people:write");
  const canSetRole = canWrite && orgRoles.length > 0;
  const canInvite = canWrite && orgRoles.length > 0;
  const canRemove = permissions.has("people:delete");

  const onChangeRole = useCallback(
    (member: Member, roleKey: string) => {
      const next = orgRoles.find((r) => r.key === roleKey);
      if (!next) return;
      startTransition(async () => {
        applyOptimistic({ id: member.id, orgRole: { key: next.key, name: next.name } });
        try {
          await setOrgRoleAction(member.id, roleKey);
          toast.success("Org role updated", {
            description: `${fullName(member)} is now ${next.name}`,
          });
        } catch (e) {
          toast.error("Couldn't change org role", { description: (e as Error).message });
        }
      });
    },
    [applyOptimistic, orgRoles],
  );

  const onResend = useCallback((member: Member) => {
    startTransition(async () => {
      try {
        await resendInviteAction(member.id);
        toast.success("Invitation resent", { description: member.email });
      } catch (e) {
        toast.error("Couldn't resend invite", { description: (e as Error).message });
      }
    });
  }, []);

  const confirmCancel = useCallback(() => {
    if (!cancelTarget) return;
    const member = cancelTarget;
    startTransition(async () => {
      try {
        await cancelInviteAction(member.id);
        toast.success("Invitation cancelled", { description: member.email });
        setCancelTarget(null);
      } catch (e) {
        toast.error("Couldn't cancel invite", { description: (e as Error).message });
      }
    });
  }, [cancelTarget]);

  const confirmRemove = useCallback(() => {
    if (!removeTarget) return;
    const member = removeTarget;
    startTransition(async () => {
      try {
        await removePersonAction(member.id);
        toast.success("Member removed");
        setRemoveTarget(null);
      } catch (e) {
        toast.error("Couldn't remove member", { description: (e as Error).message });
      }
    });
  }, [removeTarget]);

  const columns = useMemo(
    () =>
      memberColumns({
        canSetRole,
        canInvite: canWrite,
        canRemove,
        currentUserEmail: user.email,
        roles: orgRoles,
        teamRoleKeys: teamKeys,
        titles,
        onRemove: setRemoveTarget,
        onChangeRole,
        onResend,
        onCancelInvite: setCancelTarget,
      }),
    [
      canSetRole,
      canWrite,
      canRemove,
      user.email,
      orgRoles,
      teamKeys,
      titles,
      onChangeRole,
      onResend,
    ],
  );

  return (
    <div className="flex flex-col gap-6">
      <DataTable<Member>
        columns={columns}
        rows={optimisticRows}
        total={total}
        state={state}
        isLoading={false}
        isFetching={isStale || isPending}
        isError={false}
        refetch={() => router.refresh()}
        getRowId={(m) => m.id}
        searchPlaceholder="Search by name or email…"
        facets={[
          ...(roles.length > 0
            ? [
                {
                  columnId: "roleKey",
                  title: "Org role",
                  options: roles.map((r) => ({ label: r.name, value: r.key })),
                },
              ]
            : []),
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
        emptyTitle="No members yet"
        emptyDescription="Invite teammates to help manage courses and students."
        emptyAction={
          canInvite ? (
            <Button variant="primary" onClick={() => setInviteOpen(true)}>
              <UserPlus />
              Invite member
            </Button>
          ) : undefined
        }
      />

      {canInvite ? (
        <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} roles={orgRoles} />
      ) : null}

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(o) => !o && setCancelTarget(null)}
        title="Cancel invite"
        description={
          cancelTarget
            ? `The invitation to ${cancelTarget.email} stops working. You can invite them again later.`
            : ""
        }
        confirmLabel="Cancel invite"
        destructive
        pending={isPending}
        onConfirm={confirmCancel}
      />

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title="Remove member"
        description={
          removeTarget
            ? `${fullName(removeTarget)} will lose access to this organization, with every role they hold in it. This can't be undone, but they can be invited again.`
            : ""
        }
        confirmLabel="Remove member"
        destructive
        pending={isPending}
        onConfirm={confirmRemove}
      />
    </div>
  );
}

export function MembersTable(props: {
  rows: Member[];
  total: number;
  params: ListParams;
  roles: OrgRole[];
  titles: Record<string, string>;
}) {
  // `useDataTable` reads `useSearchParams()`, which requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <MembersTableInner {...props} />
    </Suspense>
  );
}
