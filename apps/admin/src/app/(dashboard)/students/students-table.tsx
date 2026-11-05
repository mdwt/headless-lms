"use client";

import { Suspense, useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/components/data-table/use-data-table";
import { usePermissions } from "@/lib/auth/permissions-context";
import type { ListParams, OrgRole, Student } from "@/lib/api/types";
import { defaultOrgRole, givableOrgRoles } from "@/lib/org-roles";
import { fullName } from "@/lib/format";

import { studentColumns } from "./_components/student-columns";
import { AddStudentDialog } from "./_components/add-student-dialog";
import { removePersonAction, resendInviteAction } from "../settings/team/actions";
import { SetRoleDialog } from "../settings/team/_components/set-role-dialog";

// Students table (client): rows come in as props.
function StudentsTableInner({
  rows,
  total,
  params,
  roles,
  titles,
}: {
  rows: Student[];
  total: number;
  params: ListParams;
  roles: OrgRole[];
  titles: Record<string, string>;
}) {
  const permissions = usePermissions();
  const canWrite = permissions.has("people:write");
  const orgRoles = useMemo(() => givableOrgRoles(roles), [roles]);
  const memberKey = defaultOrgRole(roles)?.key ?? "";
  const [roleTarget, setRoleTarget] = useState<Student | null>(null);
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);

  const table = useDataTable({
    pageSize: params.pageSize,
    initialSort: params.sort,
  });

  // Navigation in flight: URL is ahead of the rows the server rendered.
  const isStale = JSON.stringify(table.params) !== JSON.stringify(params);

  const goToStudent = useCallback((id: string) => router.push(`/students/${id}`), [router]);

  // Delete confirmation target.
  const [toDelete, setToDelete] = useState<Student | null>(null);
  const [isPending, startTransition] = useTransition();

  const confirmDelete = useCallback(() => {
    if (!toDelete) return;
    const student = toDelete;
    startTransition(async () => {
      try {
        await removePersonAction(student.id);
        toast.success("Removed from org");
        setToDelete(null);
      } catch (e) {
        toast.error("Couldn't remove student", { description: (e as Error).message });
      }
    });
  }, [toDelete]);

  const resend = useCallback((student: Student) => {
    startTransition(async () => {
      try {
        await resendInviteAction(student.id);
        toast.success("Invitation resent", { description: student.email });
      } catch (e) {
        toast.error("Couldn't resend invite", { description: (e as Error).message });
      }
    });
  }, []);

  const canSetRole = canWrite && orgRoles.length > 0;
  const canRemove = permissions.has("people:delete");
  const columns = useMemo(
    () =>
      studentColumns({
        titles,
        onView: goToStudent,
        onSetRole: canSetRole ? setRoleTarget : undefined,
        onResend: canWrite ? resend : undefined,
        onRemove: canRemove ? setToDelete : undefined,
      }),
    [titles, goToStudent, canSetRole, canWrite, canRemove, resend],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Students"
        actions={
          canWrite ? (
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              <Plus />
              Add student
            </Button>
          ) : undefined
        }
      />
      {canWrite ? <AddStudentDialog open={addOpen} onOpenChange={setAddOpen} /> : null}
      <SetRoleDialog
        person={
          roleTarget ? { id: roleTarget.id, name: fullName(roleTarget), roleKey: memberKey } : null
        }
        roles={orgRoles}
        onOpenChange={(open) => !open && setRoleTarget(null)}
      />

      <DataTable<Student>
        columns={columns}
        rows={rows}
        total={total}
        state={table}
        isLoading={false}
        isFetching={isStale || isPending}
        isError={false}
        refetch={() => router.refresh()}
        getRowId={(s) => s.id}
        searchPlaceholder="Search students…"
        onRowClick={(s) => goToStudent(s.id)}
        emptyTitle="No students yet"
        emptyDescription="Add a student or wait for enrollments to appear here."
      />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => {
          if (!o) setToDelete(null);
        }}
        title="Remove from org?"
        description={
          toDelete ? (
            <>
              This removes <span className="font-medium text-ink">{fullName(toDelete)}</span> from
              the organization, along with their entitlements and progress. This can&apos;t be
              undone.
            </>
          ) : null
        }
        confirmLabel="Remove from org"
        destructive
        pending={isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export function StudentsTable(props: {
  rows: Student[];
  total: number;
  params: ListParams;
  roles: OrgRole[];
  titles: Record<string, string>;
}) {
  // `useDataTable` reads `useSearchParams()`, which requires a Suspense
  // boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <StudentsTableInner {...props} />
    </Suspense>
  );
}
