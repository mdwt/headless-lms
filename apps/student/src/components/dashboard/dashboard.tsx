"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { courses as allCourses, enrollments, student, monthlyHoursLabel } from "@/lib/mock-data";
import { coursePercent, completedCount, totalLessons, findLesson, moduleOfLesson } from "@/lib/progress";
import { dateLabel, greeting, firstName } from "@/lib/format";
import { useApp } from "@/lib/store";
import { DashboardHeader } from "./dashboard-header";
import { GreetingStats } from "./greeting-stats";
import { ContinueHero } from "./continue-hero";
import { Toolbar, type FilterValue, type SortValue, type LayoutValue } from "./toolbar";
import { CourseCard, type CourseState } from "./course-card";
import { CourseListRow } from "./course-list-row";
import { FilterEmpty } from "./empty-states";

function stateOf(status: string, percent: number): CourseState {
  if (status === "expired") return "expired";
  if (percent >= 100) return "completed";
  if (percent === 0) return "not-started";
  return "in-progress";
}

export function Dashboard() {
  const router = useRouter();
  const { completionByCourse } = useApp();
  const [filter, setFilter] = React.useState<FilterValue>("all");
  const [sort, setSort] = React.useState<SortValue>("recent");
  const [layout, setLayout] = React.useState<LayoutValue>("grid");

  const open = (courseId: string) => router.push(`/courses/${courseId}`);

  // View model per enrolled course (enrollment order = "recently accessed").
  const items = enrollments.map((e) => {
    const course = allCourses.find((c) => c.id === e.courseId)!;
    const completion = completionByCourse[e.courseId] ?? {};
    const percent = coursePercent(course, completion);
    return { course, enrollment: e, percent, state: stateOf(e.status, percent) };
  });

  const inProgressCount = items.filter((i) => i.state === "in-progress").length;
  const completedTotal = items.filter((i) => i.state === "completed").length;

  // Hero = most-recently-accessed active, in-progress course.
  const heroItem = items.find((i) => i.enrollment.status === "active" && i.state === "in-progress");
  let heroProps: React.ComponentProps<typeof ContinueHero> | null = null;
  if (heroItem) {
    const { course, enrollment, percent } = heroItem;
    const lessonId = enrollment.lastAccessedLessonId;
    const lesson = lessonId ? findLesson(course, lessonId) : undefined;
    const mod = lessonId ? moduleOfLesson(course, lessonId) : undefined;
    const resumeLabel = mod && lesson ? `Module ${mod.order} · ${lesson.title}` : course.title;
    const lessonsLeft = totalLessons(course) - completedCount(course, completionByCourse[course.id] ?? {});
    heroProps = {
      course,
      percent,
      resumeLabel,
      lessonsLeft,
      onContinue: () => open(course.id),
    };
  }

  // Filter + sort.
  let visible = items.filter((i) => {
    if (filter === "inprogress") return i.state === "in-progress";
    if (filter === "completed") return i.state === "completed";
    return true;
  });
  visible = [...visible].sort((a, b) => {
    if (sort === "progress") return b.percent - a.percent;
    if (sort === "title") return a.course.title.localeCompare(b.course.title);
    return 0; // recent = source order
  });

  return (
    <>
      <DashboardHeader />
      <div className="mx-auto max-w-[1180px] px-7 pb-[70px] pt-[30px]">
        <GreetingStats
          eyebrow={dateLabel()}
          heading={`${greeting()}, ${firstName(student.name)}`}
          stats={[
            { value: String(inProgressCount), label: "in progress" },
            { value: String(completedTotal), label: "completed" },
            { value: monthlyHoursLabel, label: "this month" },
          ]}
        />

        {heroProps && <ContinueHero {...heroProps} />}

        <Toolbar
          filter={filter}
          onFilter={setFilter}
          sort={sort}
          onSort={setSort}
          layout={layout}
          onLayout={setLayout}
        />

        {visible.length === 0 ? (
          <FilterEmpty onShowAll={() => setFilter("all")} />
        ) : layout === "grid" ? (
          <div className="grid grid-cols-1 gap-[18px] min-[900px]:grid-cols-2 min-[1080px]:grid-cols-3">
            {visible.map((i) => (
              <CourseCard
                key={i.course.id}
                course={i.course}
                percent={i.percent}
                state={i.state}
                onOpen={() => open(i.course.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visible.map((i) => (
              <CourseListRow
                key={i.course.id}
                course={i.course}
                percent={i.percent}
                state={i.state}
                onOpen={() => open(i.course.id)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
