"use client";

import * as React from "react";
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

import { memberColumns } from "./members-columns";
import { InviteSheet } from "./_components/invite-sheet";
import { updateMemberRoleAction, removeMemberAction } from "./actions";

const ROLE_FACETS = [
  { label: "Owner", value: "owner" },
  { label: "Admin", value: "admin" },
  { label: "Instructor", value: "instructor" },
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
  const [optimisticRows, applyOptimistic] = React.useOptimistic(
    rows,
    (rowsState: Member[], patch: { id: string; role: Role }) =>
      rowsState.map((m) => (m.id === patch.id ? { ...m, role: patch.role } : m)),
  );

  const [isPending, startTransition] = React.useTransition();

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [removeTarget, setRemoveTarget] = React.useState<Member | null>(null);

  const canManageRoles = can.manageRoles(user);
  const canInvite = can.inviteMembers(user);

  const onChangeRole = React.useCallback(
    (id: string, role: Role) => {
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

  const confirmRemove = React.useCallback(() => {
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

  const columns = React.useMemo(
    () =>
      memberColumns({
        canManageRoles,
        currentUserId: user.id,
        onRemove: setRemoveTarget,
        onChangeRole,
      }),
    [canManageRoles, user.id, onChangeRole],
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
        pending={isPending}
        onConfirm={confirmRemove}
      />
    </div>
  );
}

export function MembersTable(props: { rows: Member[]; total: number; params: ListParams }) {
  // `useDataTable` reads `useSearchParams()`, which requires a Suspense boundary.
  return (
    <React.Suspense fallback={null}>
      <MembersTableInner {...props} />
    </React.Suspense>
  );
}
