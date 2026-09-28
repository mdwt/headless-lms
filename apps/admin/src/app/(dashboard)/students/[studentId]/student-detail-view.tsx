"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { RowActions } from "@/components/data-table/row-actions";
import { ForbiddenView } from "@/components/full-page-states";
import { EntitlementStatusBadge } from "@/components/status-badge";
import { NameAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentUser } from "@/lib/auth/session-context";
import { isManager } from "@/lib/roles";
import { formatDate, fullName, relativeTime, relativeTimeCompact } from "@/lib/format";
import type {
  Entitlement,
  Student,
  StudentAnalytics,
  StudentCourseProgress,
} from "@/lib/api/types";

import { GrantAccessDialog, type LiteContent } from "../_components/grant-access-dialog";
import { setEntitlementStatusAction } from "../../entitlements/actions";
import { deleteStudentAction, resendStudentInviteAction } from "../actions";
import { StudentDetailsForm } from "./student-details-form";

/**
 * Student detail client view (option 2). The student and their entitlements
 * arrive as PROPS from the Server Component — no `useStudent`/
 * `useStudentEntitlements`, no client query cache, so no loading/error states.
 * The role check stays as belt-and-suspenders (the RSC already gated managers).
 */
export function StudentDetailView({
  student,
  entitlements,
  content,
  analytics,
}: {
  student: Student;
  entitlements: Entitlement[];
  content: LiteContent[];
  analytics: StudentAnalytics;
}) {
  const user = useCurrentUser();
  const router = useRouter();
  const [grantOpen, setGrantOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Entitlement | null>(null);
  const [deleting, startDelete] = useTransition();
  const [resending, startResend] = useTransition();
  const [updatingAccess, startAccessUpdate] = useTransition();

  if (!isManager(user.role)) return <ForbiddenView />;

  const onResendInvite = () =>
    startResend(async () => {
      try {
        await resendStudentInviteAction(student.id);
        toast.success("Invite sent", { description: student.email });
        router.refresh();
      } catch (err) {
        toast.error("Couldn't send the invite", { description: (err as Error).message });
      }
    });

  const onReinstate = (e: Entitlement) =>
    startAccessUpdate(async () => {
      try {
        await setEntitlementStatusAction(e.id, "reinstate");
        toast.success("Access reinstated");
        router.refresh();
      } catch (err) {
        toast.error("Couldn't update access", { description: (err as Error).message });
      }
    });

  const confirmRevoke = () => {
    if (!revokeTarget) return;
    const target = revokeTarget;
    startAccessUpdate(async () => {
      try {
        await setEntitlementStatusAction(target.id, "revoke");
        toast.success("Access revoked");
        setRevokeTarget(null);
        router.refresh();
      } catch (err) {
        toast.error("Couldn't update access", { description: (err as Error).message });
      }
    });
  };

  // On success we leave the page — the list is revalidated by the action.
  const onDelete = () =>
    startDelete(async () => {
      try {
        await deleteStudentAction(student.id);
        toast.success("Student deleted");
        router.push("/students");
      } catch (err) {
        toast.error("Couldn't delete student", { description: (err as Error).message });
      }
    });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-ink-3">
          <Link href="/students">
            <ArrowLeft />
            Students
          </Link>
        </Button>
      </div>

      <StudentHeader
        student={student}
        resending={resending}
        onResendInvite={onResendInvite}
        onDelete={() => setConfirmDelete(true)}
      />

      <Tabs defaultValue="details" className="flex flex-col gap-6">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="access">Access</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <StudentDetailsForm student={student} />
        </TabsContent>

        <TabsContent value="access" className="flex flex-col gap-4">
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
            <ul className="divide-y divide-line">
              {entitlements.map((e) => (
                <EntitlementRow
                  key={e.id}
                  entitlement={e}
                  onRevoke={() => setRevokeTarget(e)}
                  onReinstate={() => onReinstate(e)}
                />
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="flex flex-col gap-8">
          <StudentAnalyticsPanel analytics={analytics} />
        </TabsContent>
      </Tabs>

      <GrantAccessDialog
        open={grantOpen}
        onOpenChange={setGrantOpen}
        studentId={student.id}
        content={content}
      />

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        title="Revoke access?"
        description={
          revokeTarget ? (
            <>
              <span className="font-medium text-ink">{fullName(student)}</span> will immediately
              lose access to {revokeTarget.content.title}. You can reinstate it later.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Revoke access"
        destructive
        pending={updatingAccess}
        onConfirm={confirmRevoke}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete student?"
        description={
          <>
            This permanently deletes{" "}
            <span className="font-medium text-ink">{fullName(student)}</span>, along with their
            entitlements and progress. This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete student"
        destructive
        pending={deleting}
        onConfirm={onDelete}
      />
    </div>
  );
}

function StudentHeader({
  student,
  resending,
  onResendInvite,
  onDelete,
}: {
  student: Student;
  resending: boolean;
  onResendInvite: () => void;
  onDelete: () => void;
}) {
  // A student exists from the moment an admin adds them, so the page has to say
  // whether they have actually arrived.
  const pending = student.status === "invited";
  const stats: { label: string; value: string }[] = [
    { label: "Entitlements", value: String(student.entitlementCount) },
    { label: "Avg. progress", value: `${Math.round(student.avgProgress)}%` },
    { label: "Last active", value: relativeTimeCompact(student.lastActiveAt) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <NameAvatar name={fullName(student)} image={student.image} className="size-12 text-sm" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <h1 className="truncate text-xl font-semibold tracking-tight text-ink text-balance">
                {fullName(student)}
              </h1>
              {pending && <Badge variant="warning">Invite pending</Badge>}
            </div>
            <p className="truncate text-sm text-ink-3">{student.email}</p>
            <p className="text-xs text-ink-4">
              {pending ? "Added" : "Joined"} {formatDate(student.joinedAt)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {pending && (
            <Button variant="secondary" size="sm" onClick={onResendInvite} disabled={resending}>
              Resend invite
            </Button>
          )}
          <RowActions label="Student actions">
            <DropdownMenuItem variant="danger" onClick={onDelete}>
              Delete student
            </DropdownMenuItem>
          </RowActions>
        </div>
      </div>

      <div className="@container">
        <dl className="grid grid-cols-1 divide-y divide-line @sm:grid-cols-3 @sm:divide-x @sm:divide-y-0">
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 @sm:px-8 @sm:py-1 @sm:first:pl-0 @sm:last:pr-0"
            >
              <dt className="truncate text-xs text-ink-3">{s.label}</dt>
              <dd className="text-2xl font-semibold tracking-tight text-ink">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function EntitlementRow({
  entitlement: e,
  onRevoke,
  onReinstate,
}: {
  entitlement: Entitlement;
  onRevoke: () => void;
  onReinstate: () => void;
}) {
  const canReinstate = e.status === "revoked" || e.status === "expired";
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-1 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
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
      <div className="flex shrink-0 justify-end">
        <RowActions label="Entitlement actions">
          {e.status === "active" ? (
            <DropdownMenuItem variant="danger" onSelect={onRevoke}>
              Revoke access
            </DropdownMenuItem>
          ) : null}
          {canReinstate ? (
            <DropdownMenuItem onSelect={onReinstate}>Reinstate access</DropdownMenuItem>
          ) : null}
        </RowActions>
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

function ProgressCell({ progress }: { progress: number }) {
  const pct = Math.max(0, Math.min(100, progress));
  return (
    <div className="ml-auto flex w-36 items-center justify-end gap-2.5">
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-xs text-ink-3">{pct}%</span>
    </div>
  );
}

function CourseProgressRow({ course }: { course: StudentCourseProgress }) {
  return (
    <tr>
      <td className="py-2.5 pr-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="truncate text-ink">{course.title}</span>
          {course.completedAt && <Badge variant="success">Completed</Badge>}
        </div>
      </td>
      <td className="py-2.5 pr-4 whitespace-nowrap text-right text-ink-2 tabular-nums">
        {course.completedActivities}/{course.totalActivities}
      </td>
      <td className="py-2.5 pr-4 whitespace-nowrap text-right text-ink-2">
        {relativeTime(course.lastActivityAt)}
      </td>
      <td className="py-2.5">
        <ProgressCell progress={course.progress} />
      </td>
    </tr>
  );
}

/**
 * Learner record: KPI row (same flat treatment as the course analytics tab)
 * over a per-course progress table, computed against the courses the student
 * currently holds an active entitlement to.
 */
function StudentAnalyticsPanel({ analytics }: { analytics: StudentAnalytics }) {
  const stats: { label: string; value: string }[] = [
    { label: "Courses", value: String(analytics.enrolled) },
    { label: "Started", value: String(analytics.started) },
    { label: "Completed", value: String(analytics.completed) },
    { label: "Avg. progress", value: `${analytics.avgProgress}%` },
  ];

  return (
    <>
      <div className="@container">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 @md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-1 border-l-2 border-line pl-4">
              <dt className="truncate text-[0.8125rem] text-ink-3">{s.label}</dt>
              <dd className="text-[1.75rem] leading-9 font-semibold tracking-tight text-ink proportional-nums">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {analytics.courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line px-6 py-10 text-center">
          <h3 className="text-sm font-medium text-ink">No course access</h3>
          <p className="text-sm text-ink-3">
            Progress will appear here once this student has access to a course.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-medium text-ink">Course progress</h2>
            <p className="text-sm text-ink-3">
              Completed activities and last activity per course, across current access.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th className="py-2 pr-4 font-medium">Course</th>
                  <th className="w-24 py-2 pr-4 text-right font-medium">Activities</th>
                  <th className="w-28 py-2 pr-4 text-right font-medium">Last activity</th>
                  <th className="w-40 py-2 text-right font-medium">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {analytics.courses.map((c) => (
                  <CourseProgressRow key={c.courseId} course={c} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
