"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ForbiddenView } from "@/components/full-page-states";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/components/data-table/use-data-table";
import { useCurrentUser } from "@/lib/auth/session-context";
import { isManager } from "@/lib/roles";
import type { ListParams, Student } from "@/lib/api/types";

import { studentColumns } from "./_components/student-columns";
import { AddStudentSheet } from "./_components/add-student-sheet";

// Students table (client): rows come in as props.
function StudentsTableInner({
  rows,
  total,
  params,
}: {
  rows: Student[];
  total: number;
  params: ListParams;
}) {
  const user = useCurrentUser();
  const router = useRouter();
  const [addOpen, setAddOpen] = React.useState(false);

  const table = useDataTable({
    pageSize: params.pageSize,
    initialSort: params.sort,
  });

  // Navigation in flight: URL is ahead of the rows the server rendered.
  const isStale = JSON.stringify(table.params) !== JSON.stringify(params);

  const goToStudent = React.useCallback((id: string) => router.push(`/students/${id}`), [router]);

  const columns = React.useMemo(() => studentColumns(goToStudent), [goToStudent]);

  // Defense-in-depth: the Server Component already 404s non-managers.
  if (!isManager(user.role)) return <ForbiddenView />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Students"
        actions={
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <Plus />
            Add student
          </Button>
        }
      />
      <AddStudentSheet open={addOpen} onOpenChange={setAddOpen} />

      <DataTable<Student>
        columns={columns}
        rows={rows}
        total={total}
        state={table}
        isLoading={false}
        isFetching={isStale}
        isError={false}
        refetch={() => router.refresh()}
        getRowId={(s) => s.id}
        searchPlaceholder="Search students…"
        onRowClick={(s) => goToStudent(s.id)}
        emptyTitle="No students yet"
        emptyDescription="Add a student or wait for enrollments to appear here."
      />
    </div>
  );
}

export function StudentsTable(props: { rows: Student[]; total: number; params: ListParams }) {
  // `useDataTable` reads `useSearchParams()`, which requires a Suspense
  // boundary in the App Router.
  return (
    <React.Suspense fallback={null}>
      <StudentsTableInner {...props} />
    </React.Suspense>
  );
}
