import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { CourseStatusBadge } from "@/components/status-badge";
import type { Course } from "@/lib/api/types";
import { formatNumber, relativeTime } from "@/lib/format";

import { CourseHeaderActions } from "./course-header-actions";
import { CourseTabsNav } from "./course-tabs-nav";

// Static course header (title, status, counts) + the client publish actions and
// tab nav. Rendered by the course layout above every tab.
export function CourseHeader({ course }: { course: Course }) {
  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/courses"
        className="inline-flex w-fit items-center gap-1 rounded-md text-sm text-ink-3 outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <ChevronLeft className="size-4" />
        Courses
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-ink text-balance">
            {course.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-3">
            <CourseStatusBadge status={course.status} />
            <Dot />
            <span className="tabular-nums">{formatNumber(course.moduleCount)} modules</span>
            <Dot />
            <span className="tabular-nums">{formatNumber(course.activityCount)} activities</span>
            <Dot />
            <span className="tabular-nums">{formatNumber(course.enrolledCount)} enrolled</span>
            <Dot />
            <span>Updated {relativeTime(course.updatedAt)}</span>
          </div>
        </div>
        <CourseHeaderActions courseId={course.id} status={course.status} />
      </div>

      <CourseTabsNav courseId={course.id} />
    </div>
  );
}

function Dot() {
  return (
    <span aria-hidden className="text-ink-4">
      ·
    </span>
  );
}
