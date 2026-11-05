"use client";

import { Suspense, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";

import { ProgressCell } from "@/app/(dashboard)/students/_components/progress-meter";
import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/components/data-table/use-data-table";
import { GrantAccessButton } from "@/components/grant-access-button";
import type { LiteStudent } from "@/components/grant-access-dialog";
import { EntitlementStatusBadge } from "@/components/status-badge";
import { NameAvatar } from "@/components/ui/avatar";
import { formatDate, fullName, relativeTime } from "@/lib/format";
import type { CourseLearner, ListParams } from "@/lib/api/types";

const columns: ColumnDef<CourseLearner, unknown>[] = [
  {
    id: "name",
    header: "Learner",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => {
      const learner = row.original;
      const name = fullName(learner) || "Learner";
      return (
        <div className="flex min-w-0 items-center gap-3">
          <NameAvatar name={name} image={learner.image} className="size-8" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-ink">{name}</span>
            <span className="truncate text-ink-4">{learner.email}</span>
          </div>
        </div>
      );
    },
  },
  {
    id: "status",
    header: "Access",
    enableSorting: false,
    cell: ({ row }) => <EntitlementStatusBadge status={row.original.status} />,
  },
  {
    id: "progress",
    header: "Progress",
    enableSorting: false,
    cell: ({ row }) => <ProgressCell value={row.original.progress} />,
    meta: { align: "right" },
  },
  {
    id: "lastActivityAt",
    header: "Last active",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-ink-3">
        {row.original.lastActivityAt ? relativeTime(row.original.lastActivityAt) : "—"}
      </span>
    ),
  },
  {
    id: "grantedAt",
    header: "Granted",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-ink-3">{relativeTime(row.original.grantedAt)}</span>
    ),
  },
  {
    id: "expiresAt",
    header: "Expires",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-ink-3">
        {row.original.expiresAt ? formatDate(row.original.expiresAt) : "—"}
      </span>
    ),
  },
];

function sameParams(a: ListParams, b: ListParams): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function CourseLearnersTableInner({
  courseId,
  rows,
  total,
  params,
  grantCandidates,
  canGrant,
}: {
  courseId: string;
  rows: CourseLearner[];
  total: number;
  params: ListParams;
  grantCandidates: LiteStudent[];
  canGrant: boolean;
}) {
  const router = useRouter();
  const table = useDataTable({ pageSize: params.pageSize, initialSort: params.sort });
  const memoColumns = useMemo(() => columns, []);

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-pretty text-ink-3">
          Everyone granted this course, on its own or in a bundle, and how far they are.
        </p>
        {canGrant && (
          <GrantAccessButton
            contentId={courseId}
            contentNoun="course"
            students={grantCandidates}
            variant="secondary"
          />
        )}
      </div>
      <DataTable<CourseLearner>
        columns={memoColumns}
        rows={rows}
        total={total}
        state={table}
        isLoading={false}
        isFetching={!sameParams(table.params, params)}
        isError={false}
        refetch={() => router.refresh()}
        getRowId={(l) => l.id}
        searchPlaceholder="Search by name or email…"
        emptyTitle="No learners yet"
        emptyDescription="Students granted this course, on its own or in a bundle, appear here."
      />
    </section>
  );
}

export function CourseLearnersTable(props: {
  courseId: string;
  rows: CourseLearner[];
  total: number;
  params: ListParams;
  grantCandidates: LiteStudent[];
  canGrant: boolean;
}) {
  return (
    <Suspense fallback={null}>
      <CourseLearnersTableInner {...props} />
    </Suspense>
  );
}
