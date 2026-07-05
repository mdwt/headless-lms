"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ForbiddenView } from "@/components/full-page-states";
import { EntitlementStatusBadge } from "@/components/status-badge";
import { NameAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudent, useStudentEntitlements } from "@/lib/api/hooks";
import { useCurrentUser } from "@/lib/auth/session-context";
import { isManager } from "@/lib/roles";
import { formatDate, relativeTime } from "@/lib/format";
import type { Entitlement, Student } from "@/lib/api/types";

export default function StudentDetailPage() {
  const user = useCurrentUser();
  const params = useParams<{ studentId: string }>();
  const studentId = params.studentId;

  const student = useStudent(studentId);
  const entitlements = useStudentEntitlements(studentId);

  if (!isManager(user.role)) return <ForbiddenView />;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-ink-3">
          <Link href="/students">
            <ArrowLeft />
            Students
          </Link>
        </Button>
      </div>

      {student.isLoading ? (
        <HeaderSkeleton />
      ) : student.isError || !student.data ? (
        <ErrorBlock title="Couldn't load this student" onRetry={() => student.refetch()} />
      ) : (
        <StudentHeader student={student.data} />
      )}

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Entitlements</h2>
          {entitlements.data && entitlements.data.length > 0 ? (
            <span className="text-sm text-ink-3">{entitlements.data.length} total</span>
          ) : null}
        </div>

        {entitlements.isLoading ? (
          <ListSkeleton />
        ) : entitlements.isError ? (
          <ErrorBlock title="Couldn't load entitlements" onRetry={() => entitlements.refetch()} />
        ) : !entitlements.data || entitlements.data.length === 0 ? (
          <EmptyEntitlements />
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line bg-surface px-4 sm:px-5">
            {entitlements.data.map((e) => (
              <EntitlementRow key={e.id} entitlement={e} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StudentHeader({ student }: { student: Student }) {
  const stats: { label: string; value: string }[] = [
    { label: "Entitlements", value: String(student.enrollmentCount) },
    { label: "Avg. progress", value: `${Math.round(student.avgProgress)}%` },
    { label: "Last active", value: relativeTime(student.lastActiveAt) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <NameAvatar name={student.name} image={student.image} className="size-12 text-sm" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="truncate text-xl font-semibold tracking-tight text-ink text-balance">
            {student.name}
          </h1>
          <p className="truncate text-sm text-ink-3">{student.email}</p>
          <p className="text-xs text-ink-4">Joined {formatDate(student.joinedAt)}</p>
        </div>
      </div>

      <div className="@container">
        <dl className="grid grid-cols-1 divide-y divide-line rounded-card border border-line @sm:grid-cols-3 @sm:divide-x @sm:divide-y-0">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-1 px-5 py-4">
              <dt className="truncate text-xs text-ink-3">{s.label}</dt>
              <dd className="text-2xl font-semibold tracking-tight text-ink">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function EntitlementRow({ entitlement: e }: { entitlement: Entitlement }) {
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="truncate font-medium text-ink">{e.courseTitle}</span>
          <EntitlementStatusBadge status={e.status} />
        </div>
        <p className="text-xs text-ink-3">
          Granted {formatDate(e.grantedAt)}
          {" · "}
          {e.expiresAt ? `Expires ${relativeTime(e.expiresAt)}` : "No expiry"}
        </p>
      </div>
    </li>
  );
}

function EmptyEntitlements() {
  return (
    <div className="grid place-items-center rounded-card border border-dashed border-line bg-surface px-6 py-12 text-center">
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-sm font-medium text-ink">No entitlements</p>
        <p className="text-sm text-ink-3 text-pretty">
          This student hasn&apos;t been granted access to any courses yet.
        </p>
      </div>
    </div>
  );
}

function ErrorBlock({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-10 text-center">
      <p className="text-sm text-ink-2">{title}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-1 divide-y divide-line rounded-card border border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2 px-5 py-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="divide-y divide-line rounded-card border border-line bg-surface px-4 sm:px-5">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center justify-between gap-6 py-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-36" />
          </div>
          <Skeleton className="h-1.5 w-40 rounded-full" />
        </li>
      ))}
    </ul>
  );
}
