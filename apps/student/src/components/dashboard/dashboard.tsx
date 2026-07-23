"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type { Completion, CourseSummaryVM } from "@/lib/types";
import { dateLabel, greeting, firstName } from "@/lib/format";
import { useApp } from "@/lib/store";
import { DashboardHeader } from "./dashboard-header";
import { GreetingStats } from "./greeting-stats";
import { ContinueHero } from "./continue-hero";
import { Toolbar, type FilterValue, type SortValue, type LayoutValue } from "./toolbar";
import { CourseCard, type CourseState } from "./course-card";
import { CourseListRow } from "./course-list-row";
import { FilterEmpty, LibraryEmpty } from "./empty-states";

/** Completed / in-progress counts + a percent from local completion, using the
 *  course's activity count as the denominator (in-progress counts as half). */
function progressOf(completion: Completion, lessonCount: number) {
  const statuses = Object.values(completion);
  const done = statuses.filter((s) => s === "completed").length;
  const half = statuses.filter((s) => s === "in-progress").length;
  const percent = lessonCount === 0 ? 0 : Math.round((100 * (done + 0.5 * half)) / lessonCount);
  return { done, percent };
}

function stateOf(percent: number, done: number, half: number): CourseState {
  if (percent >= 100) return "completed";
  if (done === 0 && half === 0) return "not-started";
  return "in-progress";
}

export function Dashboard({
  courses,
  studentName,
  studentEmail,
  orgName,
}: {
  courses: CourseSummaryVM[];
  studentName: string;
  studentEmail: string;
  orgName: string;
}) {
  const router = useRouter();
  const { completionByCourse } = useApp();
  const [filter, setFilter] = React.useState<FilterValue>("all");
  const [sort, setSort] = React.useState<SortValue>("recent");
  const [layout, setLayout] = React.useState<LayoutValue>("grid");

  const open = (courseId: string) => router.push(`/courses/${courseId}`);

  const items = courses.map((course) => {
    const completion = completionByCourse[course.id] ?? {};
    const statuses = Object.values(completion);
    const half = statuses.filter((s) => s === "in-progress").length;
    const { done, percent } = progressOf(completion, course.lessonCount);
    return { course, completion, percent, done, state: stateOf(percent, done, half) };
  });

  const inProgressTotal = items.filter((i) => i.state === "in-progress").length;
  const completedTotal = items.filter((i) => i.state === "completed").length;

  // Hero = first in-progress course.
  const heroItem = items.find((i) => i.state === "in-progress");
  let heroProps: React.ComponentProps<typeof ContinueHero> | null = null;
  if (heroItem) {
    const { course, percent, done } = heroItem;
    heroProps = {
      course,
      percent,
      resumeLabel: `${done} of ${course.lessonCount} lessons complete`,
      lessonsLeft: Math.max(0, course.lessonCount - done),
      onContinue: () => open(course.id),
    };
  }

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
      <DashboardHeader studentName={studentName} studentEmail={studentEmail} orgName={orgName} />
      <div className="mx-auto max-w-[1180px] px-7 pb-[70px] pt-[30px]">
        <GreetingStats
          eyebrow={dateLabel()}
          heading={`${greeting()}, ${firstName(studentName)}`}
          stats={[
            { value: String(inProgressTotal), label: "in progress" },
            { value: String(completedTotal), label: "completed" },
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

        {courses.length === 0 ? (
          <LibraryEmpty />
        ) : visible.length === 0 ? (
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
