"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Pencil, RotateCw } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { CourseStatusBadge } from "@/components/status-badge";
import { ForbiddenView } from "@/components/full-page-states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCourse, useModules, useToggleCoursePublish } from "@/lib/api/hooks";
import { useCurrentUser } from "@/lib/auth/session-context";
import { can } from "@/lib/roles";
import { formatNumber, relativeTime } from "@/lib/format";

import { ModuleList } from "./_components/module-list";
import { CourseDetailsSheet } from "./_components/course-details-sheet";

function statusOf(error: unknown): number | undefined {
  return (error as { status?: number } | null)?.status;
}

export default function CourseBuilderPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const user = useCurrentUser();

  const courseQ = useCourse(courseId);
  const modulesQ = useModules(courseId);
  const togglePublish = useToggleCoursePublish();

  const [detailsOpen, setDetailsOpen] = React.useState(false);

  const canEdit = can.editCourse(user, courseId);

  // --- loading ---
  if (courseQ.isLoading) return <BuilderSkeleton />;

  // --- course error ---
  if (courseQ.isError || !courseQ.data) {
    if (statusOf(courseQ.error) === 403) return <ForbiddenView />;
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <ErrorState
          title="Couldn't load this course"
          message={(courseQ.error as Error | null)?.message}
          onRetry={() => courseQ.refetch()}
        />
      </div>
    );
  }

  const course = courseQ.data;

  // Instructors may only open the builder for courses they're scoped to.
  if (user.role === "instructor" && !canEdit) return <ForbiddenView />;

  const moduleCount = modulesQ.data?.length ?? course.moduleCount;
  const activityCount =
    modulesQ.data?.reduce((sum, m) => sum + m.activities.length, 0) ?? course.activityCount;

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
                <Button
                  variant="primary"
                  onClick={() => togglePublish.mutate({ course })}
                  disabled={togglePublish.isPending}
                >
                  {course.status === "published" ? "Unpublish" : "Publish"}
                </Button>
              ) : null}
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-3">
            <CourseStatusBadge status={course.status} />
            <span aria-hidden className="text-ink-4">·</span>
            <span className="tabular-nums">{formatNumber(moduleCount)} modules</span>
            <span aria-hidden className="text-ink-4">·</span>
            <span className="tabular-nums">{formatNumber(activityCount)} activities</span>
            <span aria-hidden className="text-ink-4">·</span>
            <span className="tabular-nums">{formatNumber(course.enrolledCount)} enrolled</span>
            <span aria-hidden className="text-ink-4">·</span>
            <span>Updated {relativeTime(course.updatedAt)}</span>
          </div>
        </PageHeader>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-ink-2">Curriculum</h2>
          {!canEdit ? (
            <span className="text-xs text-ink-4">Read-only</span>
          ) : null}
        </div>

        {modulesQ.isLoading ? (
          <ModulesSkeleton />
        ) : modulesQ.isError ? (
          <ErrorState
            title="Couldn't load the curriculum"
            message={(modulesQ.error as Error | null)?.message}
            onRetry={() => modulesQ.refetch()}
          />
        ) : (
          <ModuleList courseId={courseId} modules={modulesQ.data ?? []} canEdit={canEdit} />
        )}
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

function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message?: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-12 text-center">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        {message ? <p className="text-sm text-ink-3 text-pretty">{message}</p> : null}
      </div>
      <Button variant="secondary" onClick={onRetry}>
        <RotateCw className="size-4" />
        Try again
      </Button>
    </div>
  );
}

function BuilderSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-20" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-64" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <Skeleton className="h-4 w-80" />
      </div>
      <ModulesSkeleton />
    </div>
  );
}

function ModulesSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-card border border-line bg-surface">
          <div className="flex items-center gap-3 border-b border-line px-3 py-2.5">
            <Skeleton className="size-7 rounded-md" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="flex flex-col gap-2 px-3 py-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
