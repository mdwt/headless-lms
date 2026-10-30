"use client";

import { Suspense, useCallback, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

import { ForbiddenView } from "@/components/full-page-states";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/components/data-table/use-data-table";
import { useCurrentUser } from "@/lib/auth/session-context";
import { isManager, can } from "@/lib/roles";
import type { Member, Role, ListParams } from "@/lib/api/types";
import { fullName } from "@/lib/format";

import { memberColumns, type AssignableRole } from "./members-columns";
import { InviteDialog } from "./_components/invite-dialog";
import { updateMemberRoleAction, removeMemberAction, removeModeratorRoleAction } from "./actions";

const ROLE_FACETS = [
  { label: "Owner", value: "owner" },
  { label: "Admin", value: "admin" },
  { label: "Instructor", value: "instructor" },
  { label: "Moderator", value: "moderator" },
];

const STATUS_FACETS = [
  { label: "Active", value: "active" },
  { label: "Invited", value: "invited" },
];

/** Deep-equal on the small, JSON-safe `ListParams` shape (both sides built by
 *  the same `parseListParams`, so key order is stable). */
function sameParams(a: ListParams, b: ListParams): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Members table (client): rows come in as props; edits go through server actions.
function MembersTableInner({
  rows,
  total,
  params,
}: {
  rows: Member[];
  total: number;
  params: ListParams;
}) {
  const router = useRouter();
  const user = useCurrentUser();

  const state = useDataTable({ pageSize: params.pageSize, initialSort: params.sort });

  // Navigation in flight: URL is ahead of the rows the server rendered.
  const isStale = !sameParams(state.params, params);

  // Optimistic role flips. Base resets to `rows` whenever the RSC re-renders,
  // so the optimistic value is discarded once the real (revalidated) row lands.
  const [optimisticRows, applyOptimistic] = useOptimistic(
    rows,
    (rowsState: Member[], patch: { id: string; role: Role }) =>
      rowsState.map((m) => (m.id === patch.id ? { ...m, role: patch.role } : m)),
  );

  const [isPending, startTransition] = useTransition();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

  const canManageRoles = can.manageRoles(user);
  const canInvite = can.inviteMembers(user);

  const onChangeRole = useCallback(
    (id: string, role: AssignableRole) => {
      startTransition(async () => {
        applyOptimistic({ id, role });
        try {
          await updateMemberRoleAction(id, role);
          toast.success("Role updated");
        } catch (e) {
          toast.error("Couldn't change role", { description: (e as Error).message });
        }
      });
    },
    [applyOptimistic],
  );

  const onRemoveModerator = useCallback((member: Member) => {
    startTransition(async () => {
      try {
        await removeModeratorRoleAction(member.id);
        toast.success(`${fullName(member)} is no longer a moderator`);
      } catch (e) {
        toast.error("Couldn't remove the moderator role", { description: (e as Error).message });
      }
    });
  }, []);

  const confirmRemove = useCallback(() => {
    if (!removeTarget) return;
    const member = removeTarget;
    startTransition(async () => {
      try {
        await removeMemberAction(member.id);
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
        canManageRoles,
        currentUserEmail: user.email,
        onRemove: setRemoveTarget,
        onChangeRole,
        onRemoveModerator,
      }),
    [canManageRoles, user.email, onChangeRole, onRemoveModerator],
  );

  // Guard deep-links even though nav hides this for non-managers (defense in
  // depth alongside the server-side gate in page.tsx and the API).
  if (!isManager(user.role)) return <ForbiddenView />;

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

      {canInvite ? <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} /> : null}

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title="Remove member"
        description={
          removeTarget
            ? `${fullName(removeTarget)} will lose access to this organization. This can't be undone, but they can be invited again.`
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

export function MembersTable(props: { rows: Member[]; total: number; params: ListParams }) {
  // `useDataTable` reads `useSearchParams()`, which requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <MembersTableInner {...props} />
    </Suspense>
  );
}
