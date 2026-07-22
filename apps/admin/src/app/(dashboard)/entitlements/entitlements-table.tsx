"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ForbiddenView } from "@/components/full-page-states";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/components/data-table/use-data-table";
import { useCurrentUser } from "@/lib/auth/session-context";
import { isManager } from "@/lib/roles";
import type { Entitlement, ListParams } from "@/lib/api/types";

import { entitlementColumns } from "./entitlements-columns";
import { GrantAccessSheet, type LiteCourse, type LiteStudent } from "./_components/grant-access-sheet";
import { setEntitlementStatusAction } from "./actions";

/** Deep-equal on the small, JSON-safe `ListParams` shape (both sides built by
 *  the same `parseListParams`, so key order is stable). */
function sameParams(a: ListParams, b: ListParams): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Entitlements table (client): rows come in as props; edits go through server actions.
function EntitlementsTableInner({
  rows,
  total,
  params,
  students,
  courses,
}: {
  rows: Entitlement[];
  total: number;
  params: ListParams;
  students: LiteStudent[];
  courses: LiteCourse[];
}) {
  const router = useRouter();
  const user = useCurrentUser();

  const table = useDataTable({ pageSize: params.pageSize, initialSort: params.sort });

  // Navigation in flight: URL is ahead of the rows the server rendered.
  const isStale = !sameParams(table.params, params);

  // Optimistic status flips. Base resets to `rows` whenever the RSC re-renders,
  // so the optimistic value is discarded once the real (revalidated) row lands.
  const [optimisticRows, applyOptimistic] = React.useOptimistic(
    rows,
    (state: Entitlement[], patch: { id: string; status: Entitlement["status"] }) =>
      state.map((e) => (e.id === patch.id ? { ...e, status: patch.status } : e)),
  );

  const [isPending, startTransition] = React.useTransition();

  const [grantOpen, setGrantOpen] = React.useState(false);
  const [revokeTarget, setRevokeTarget] = React.useState<Entitlement | null>(null);

  const onRevoke = React.useCallback((e: Entitlement) => setRevokeTarget(e), []);

  const onReinstate = React.useCallback(
    (e: Entitlement) => {
      startTransition(async () => {
        applyOptimistic({ id: e.id, status: "active" });
        try {
          await setEntitlementStatusAction(e.id, "reinstate");
          toast.success("Access reinstated");
        } catch (err) {
          toast.error("Couldn't update access", { description: (err as Error).message });
        }
      });
    },
    [applyOptimistic],
  );

  const confirmRevoke = React.useCallback(() => {
    if (!revokeTarget) return;
    const target = revokeTarget;
    startTransition(async () => {
      applyOptimistic({ id: target.id, status: "revoked" });
      try {
        await setEntitlementStatusAction(target.id, "revoke");
        toast.success("Access revoked");
        setRevokeTarget(null);
      } catch (err) {
        toast.error("Couldn't update access", { description: (err as Error).message });
      }
    });
  }, [revokeTarget, applyOptimistic]);

  const columns = React.useMemo(
    () => entitlementColumns(onRevoke, onReinstate),
    [onRevoke, onReinstate],
  );

  if (!isManager(user.role)) return <ForbiddenView />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Entitlements"
      />

      <DataTable<Entitlement>
        columns={columns}
        rows={optimisticRows}
        total={total}
        state={table}
        isLoading={false}
        isFetching={isStale || isPending}
        isError={false}
        refetch={() => router.refresh()}
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

      <GrantAccessSheet
        open={grantOpen}
        onOpenChange={setGrantOpen}
        students={students}
        courses={courses}
      />

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        title="Revoke access?"
        description={
          revokeTarget
            ? `${revokeTarget.firstName} ${revokeTarget.lastName} will immediately lose access to ${revokeTarget.content.title}. You can reinstate it later.`
            : ""
        }
        confirmLabel="Revoke access"
        destructive
        pending={isPending}
        onConfirm={confirmRevoke}
      />
    </div>
  );
}

export function EntitlementsTable(props: {
  rows: Entitlement[];
  total: number;
  params: ListParams;
  students: LiteStudent[];
  courses: LiteCourse[];
}) {
  // `useDataTable` reads `useSearchParams()`, which requires a Suspense boundary.
  return (
    <React.Suspense fallback={null}>
      <EntitlementsTableInner {...props} />
    </React.Suspense>
  );
}
