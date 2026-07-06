"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { CourseStatusBadge } from "@/components/status-badge";
import { ForbiddenView } from "@/components/full-page-states";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/lib/auth/session-context";
import { can } from "@/lib/roles";
import type { Course, Module, Role } from "@/lib/api/types";
import { formatNumber, relativeTime } from "@/lib/format";

import { ModuleList } from "./_components/module-list";
import { CourseDetailsSheet } from "./_components/course-details-sheet";
import { setCoursePublishedAction } from "./actions";

// Course builder view (client): course + modules come in as props; edits go through server actions.
export function CourseBuilderView({
  courseId,
  role,
  course,
  modules,
}: {
  courseId: string;
  role: Role;
  course: Course;
  modules: Module[];
}) {
  const user = useCurrentUser();
  const router = useRouter();

  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const canEdit = can.editCourse(user, courseId);

  // Instructors may only open the builder for courses they're scoped to.
  // Scoping is sourced from the API (not yet wired → `scopedCourseIds` is empty),
  // so unscoped instructors are forbidden here.
  if (role === "instructor" && !canEdit) return <ForbiddenView />;

  const moduleCount = modules.length;
  const activityCount = modules.reduce((sum, m) => sum + m.activities.length, 0);

  function onTogglePublish() {
    const next: Course["status"] = course.status === "published" ? "draft" : "published";
    startTransition(async () => {
      try {
        await setCoursePublishedAction(course.id, next);
        toast.success(next === "published" ? "Course published" : "Moved to draft");
      } catch (e) {
        toast.error("Couldn't update status", { description: (e as Error).message });
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink />
        <PageHeader
          title={course.title}
          actions={
            <>
              {canEdit ? (
                <Button variant="secondary" onClick={() => setDetailsOpen(true)}>
                  <Pencil className="size-4" />
                  Edit details
                </Button>
              ) : null}
              {can.publishCourse(user) ? (
                <Button variant="primary" onClick={onTogglePublish} disabled={isPending}>
                  {course.status === "published" ? "Unpublish" : "Publish"}
                </Button>
              ) : null}
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-3">
            <CourseStatusBadge status={course.status} />
            <span aria-hidden className="text-ink-4">
              ·
            </span>
            <span className="tabular-nums">{formatNumber(moduleCount)} modules</span>
            <span aria-hidden className="text-ink-4">
              ·
            </span>
            <span className="tabular-nums">{formatNumber(activityCount)} activities</span>
            <span aria-hidden className="text-ink-4">
              ·
            </span>
            <span className="tabular-nums">{formatNumber(course.enrolledCount)} enrolled</span>
            <span aria-hidden className="text-ink-4">
              ·
            </span>
            <span>Updated {relativeTime(course.updatedAt)}</span>
          </div>
        </PageHeader>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-ink-2">Curriculum</h2>
          {!canEdit ? <span className="text-xs text-ink-4">Read-only</span> : null}
        </div>

        <ModuleList courseId={courseId} modules={modules} canEdit={canEdit} />
      </section>

      {canEdit ? (
        <CourseDetailsSheet open={detailsOpen} onOpenChange={setDetailsOpen} course={course} />
      ) : null}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/courses"
      className="inline-flex w-fit items-center gap-1 rounded-md text-sm text-ink-3 outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <ChevronLeft className="size-4" />
      Courses
    </Link>
  );
}
