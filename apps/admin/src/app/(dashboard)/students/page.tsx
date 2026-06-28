"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { ForbiddenView } from "@/components/full-page-states";
import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/components/data-table/use-data-table";
import { useStudents } from "@/lib/api/hooks";
import { useCurrentUser } from "@/lib/auth/session-context";
import { isManager } from "@/lib/roles";

import { studentColumns } from "./_components/student-columns";

export default function StudentsPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const table = useDataTable({ initialSort: [{ id: "lastActiveAt", desc: true }] });
  const { data, isLoading, isFetching, isError, error, refetch } = useStudents(table.params);

  const goToStudent = React.useCallback(
    (id: string) => router.push(`/students/${id}`),
    [router],
  );

  const columns = React.useMemo(() => studentColumns(goToStudent), [goToStudent]);

  if (!isManager(user.role)) return <ForbiddenView />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Students"
        description="Everyone enrolled across your organization's courses, with progress and activity at a glance."
      />

      <DataTable
        columns={columns}
        rows={data?.rows}
        total={data?.total ?? 0}
        state={table}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        error={error}
        refetch={refetch}
        getRowId={(s) => s.id}
        searchPlaceholder="Search students…"
        onRowClick={(s) => goToStudent(s.id)}
        emptyTitle="No students yet"
        emptyDescription="Students appear here once they're enrolled in a course."
      />
    </div>
  );
}
