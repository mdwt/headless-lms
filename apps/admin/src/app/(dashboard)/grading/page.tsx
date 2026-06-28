"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table/data-table";
import { ColumnHeader } from "@/components/data-table/column-header";
import { RowActions } from "@/components/data-table/row-actions";
import { useDataTable } from "@/components/data-table/use-data-table";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { NameAvatar } from "@/components/ui/avatar";
import { SubmissionStatusBadge } from "@/components/status-badge";
import { ForbiddenView } from "@/components/full-page-states";
import { useSubmissions } from "@/lib/api/hooks";
import { useCurrentUser } from "@/lib/auth/session-context";
import { can } from "@/lib/roles";
import { relativeTime } from "@/lib/format";
import type { Submission } from "@/lib/api/types";

import { GradeSheet } from "./_components/grade-sheet";

const STATUS_OPTIONS = [
  { label: "Needs grading", value: "pending" },
  { label: "Graded", value: "graded" },
  { label: "Returned", value: "returned" },
];

export default function GradingPage() {
  const user = useCurrentUser();

  const state = useDataTable({ initialSort: [{ id: "submittedAt", desc: false }] });
  const query = useSubmissions(state.params);

  const [active, setActive] = React.useState<Submission | null>(null);
  const [open, setOpen] = React.useState(false);

  const openGrade = React.useCallback((submission: Submission) => {
    setActive(submission);
    setOpen(true);
  }, []);

  // Derive the course facet from the rows currently in view.
  const courseOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of query.data?.rows ?? []) {
      if (!seen.has(row.courseTitle)) seen.set(row.courseTitle, row.courseTitle);
    }
    return Array.from(seen.keys())
      .sort((a, b) => a.localeCompare(b))
      .map((title) => ({ label: title, value: title }));
  }, [query.data?.rows]);

  const columns = React.useMemo<ColumnDef<Submission, unknown>[]>(
    () => [
      {
        accessorKey: "studentName",
        header: ({ column }) => <ColumnHeader column={column} title="Student" />,
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="flex items-center gap-3">
              <NameAvatar name={s.studentName} className="size-8" />
              <div className="min-w-0">
                <div className="truncate font-medium text-ink">{s.studentName}</div>
                <div className="truncate text-sm text-ink-3">{s.studentEmail}</div>
              </div>
            </div>
          );
        },
        enableHiding: false,
      },
      {
        accessorKey: "assessmentTitle",
        header: ({ column }) => <ColumnHeader column={column} title="Assessment" />,
        cell: ({ row }) => (
          <span className="truncate text-ink-2">{row.original.assessmentTitle}</span>
        ),
      },
      {
        accessorKey: "courseTitle",
        header: ({ column }) => <ColumnHeader column={column} title="Course" />,
        cell: ({ row }) => (
          <span className="truncate text-ink-2">{row.original.courseTitle}</span>
        ),
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      },
      {
        accessorKey: "status",
        header: ({ column }) => <ColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <SubmissionStatusBadge status={row.original.status} />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      },
      {
        accessorKey: "submittedAt",
        header: ({ column }) => <ColumnHeader column={column} title="Submitted" />,
        cell: ({ row }) => (
          <span className="text-ink-3">{relativeTime(row.original.submittedAt)}</span>
        ),
      },
      {
        accessorKey: "score",
        header: ({ column }) => <ColumnHeader column={column} title="Score" align="right" />,
        cell: ({ row }) => {
          const s = row.original;
          return (
            <span className="text-ink-2">
              {s.score === null ? (
                <span className="text-ink-4">—</span>
              ) : (
                <span className="font-medium text-ink">{s.score}</span>
              )}
              <span className="text-ink-4">/{s.pointsPossible}</span>
            </span>
          );
        },
        meta: { align: "right" },
      },
      {
        id: "actions",
        header: () => null,
        cell: ({ row }) => (
          <RowActions>
            <DropdownMenuItem onSelect={() => openGrade(row.original)}>
              {row.original.status === "graded" ? "Update grade" : "Grade"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openGrade(row.original)}>View</DropdownMenuItem>
          </RowActions>
        ),
        enableHiding: false,
      },
    ],
    [openGrade],
  );

  if (!can.grade(user)) return <ForbiddenView />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Grading queue"
        description="Review and score student submissions awaiting feedback."
      />

      <DataTable<Submission>
        columns={columns}
        rows={query.data?.rows}
        total={query.data?.total ?? 0}
        state={state}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        isError={query.isError}
        error={query.error}
        refetch={query.refetch}
        getRowId={(r) => r.id}
        searchPlaceholder="Search submissions…"
        facets={[
          { columnId: "status", title: "Status", options: STATUS_OPTIONS },
          ...(courseOptions.length
            ? [{ columnId: "courseTitle", title: "Course", options: courseOptions }]
            : []),
        ]}
        emptyTitle="Nothing to grade"
        emptyDescription="Submissions will appear here as students complete assessments."
        onRowClick={openGrade}
      />

      <GradeSheet submission={active} open={open} onOpenChange={setOpen} />
    </div>
  );
}
