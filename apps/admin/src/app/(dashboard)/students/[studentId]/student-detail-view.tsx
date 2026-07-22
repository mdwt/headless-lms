"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { ForbiddenView } from "@/components/full-page-states";
import { EntitlementStatusBadge } from "@/components/status-badge";
import { NameAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/lib/auth/session-context";
import { isManager } from "@/lib/roles";
import { formatDate, relativeTime } from "@/lib/format";
import type { Entitlement, Student } from "@/lib/api/types";

import { GrantAccessSheet, type LiteCourse } from "../_components/grant-access-sheet";
import { resendStudentInviteAction } from "../actions";

/**
 * Student detail client view (option 2). The student and their entitlements
 * arrive as PROPS from the Server Component — no `useStudent`/
 * `useStudentEntitlements`, no client query cache, so no loading/error states.
 * The role check stays as belt-and-suspenders (the RSC already gated managers).
 */
export function StudentDetailView({
  student,
  entitlements,
  courses,
}: {
  student: Student;
  entitlements: Entitlement[];
  courses: LiteCourse[];
}) {
  const user = useCurrentUser();
  const [grantOpen, setGrantOpen] = React.useState(false);
  const [resending, startResend] = React.useTransition();

  if (!isManager(user.role)) return <ForbiddenView />;

  const onResendInvite = () =>
    startResend(async () => {
      try {
        await resendStudentInviteAction(student.id);
        toast.success("Invitation sent");
      } catch (err) {
        toast.error("Couldn't resend invite", { description: (err as Error).message });
      }
    });

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

      <StudentHeader student={student} onResendInvite={onResendInvite} resending={resending} />

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Entitlements</h2>
          <div className="flex items-center gap-3">
            {entitlements.length > 0 ? (
              <span className="text-sm text-ink-3">{entitlements.length} total</span>
            ) : null}
            <Button variant="primary" size="sm" onClick={() => setGrantOpen(true)}>
              Grant access
            </Button>
          </div>
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

      <GrantAccessSheet
        open={grantOpen}
        onOpenChange={setGrantOpen}
        studentId={student.id}
        courses={courses}
      />
    </div>
  );
}

function StudentHeader({
  student,
  onResendInvite,
  resending,
}: {
  student: Student;
  onResendInvite: () => void;
  resending: boolean;
}) {
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
          {!student.hasAccount ? (
            <p className="flex items-center gap-2 text-xs text-ink-4">
              <span className="inline-flex items-center rounded-full border border-line px-2 py-0.5 font-medium text-ink-3">
                Invite pending
              </span>
              <button
                type="button"
                disabled={resending}
                onClick={onResendInvite}
                className="underline-offset-4 hover:text-ink hover:underline disabled:pointer-events-none disabled:opacity-50"
              >
                Resend invite
              </button>
            </p>
          ) : null}
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
