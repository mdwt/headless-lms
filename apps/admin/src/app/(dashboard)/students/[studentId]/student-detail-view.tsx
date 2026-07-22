"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { ForbiddenView } from "@/components/full-page-states";
import { EntitlementStatusBadge } from "@/components/status-badge";
import { NameAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/lib/auth/session-context";
import { isManager } from "@/lib/roles";
import { formatDate, relativeTime } from "@/lib/format";
import type { Entitlement, Student } from "@/lib/api/types";

/**
 * Student detail client view (option 2). The student and their entitlements
 * arrive as PROPS from the Server Component — no `useStudent`/
 * `useStudentEntitlements`, no client query cache, so no loading/error states.
 * The role check stays as belt-and-suspenders (the RSC already gated managers).
 */
export function StudentDetailView({
  student,
  entitlements,
}: {
  student: Student;
  entitlements: Entitlement[];
}) {
  const user = useCurrentUser();

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

      <StudentHeader student={student} />

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Entitlements</h2>
          {entitlements.length > 0 ? (
            <span className="text-sm text-ink-3">{entitlements.length} total</span>
          ) : null}
        </div>

        {entitlements.length === 0 ? (
          <EmptyEntitlements />
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line bg-surface px-4 sm:px-5">
            {entitlements.map((e) => (
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
    { label: "Entitlements", value: String(student.entitlementCount) },
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
          <span className="truncate font-medium text-ink">{e.content.title}</span>
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
