"use client";

import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CourseSummaryVM } from "@/lib/types";
import { CourseCover } from "@/components/primitives/course-cover";
import { coverLetter } from "@/lib/covers";
import { ProgressBar } from "@/components/primitives/progress-bar";
import { CompletedPill, ExpiredPill } from "@/components/primitives/status-pill";
import { Button } from "@/components/ui/button";

export type CourseState = "in-progress" | "not-started" | "completed" | "expired";

function action(state: CourseState) {
  switch (state) {
    case "not-started":
      return { label: "Start", variant: "brand" as const, icon: true };
    case "completed":
      return { label: "Review", variant: "ghostOutline" as const, icon: false };
    case "expired":
      return { label: "Renew", variant: "ghostOutline" as const, icon: false };
    default:
      return { label: "Continue", variant: "brand" as const, icon: true };
  }
}

/** Course card — grid layout (handoff §5). */
export function CourseCard({
  course,
  percent,
  state,
  onOpen,
}: {
  course: CourseSummaryVM;
  percent: number;
  state: CourseState;
  onOpen: () => void;
}) {
  const expired = state === "expired";
  const a = action(state);
  return (
    <article
      onClick={onOpen}
      className={cn(
        "flex cursor-pointer flex-col overflow-hidden rounded-card border border-line bg-surface transition-[transform,box-shadow,border-color] duration-200",
        "hover:-translate-y-[3px] hover:border-[#ddd9cf] hover:shadow-[0_12px_30px_-18px_rgba(20,20,18,0.28)]",
        expired && "opacity-[0.62]",
      )}
    >
      <CourseCover
        tone={course.tone}
        category={course.category}
        letter={coverLetter(course.title)}
        expired={expired}
        className="h-[150px] p-3.5"
        letterClassName="text-[104px] -right-0.5 -bottom-[22px]"
      >
        {state === "completed" && <CompletedPill className="absolute right-3 top-3 z-[1]" />}
        {expired && <ExpiredPill className="absolute right-3 top-3 z-[1]" />}
      </CourseCover>

      <div className="flex flex-1 flex-col px-[17px] pt-4 pb-[18px]">
        <h3 className="mb-1 text-[18.5px] font-semibold leading-[1.2] tracking-[-0.005em]">
          {course.title}
        </h3>
        <div className="mb-4 text-[13px] text-ink-3">{course.category}</div>

        <div className="mt-auto">
          <div className="mb-3.5 flex items-center gap-[11px]">
            <ProgressBar
              percent={percent}
              fillClassName={expired ? "bg-expired-bar" : "bg-brand"}
            />
            <span className="text-[12px] text-ink-3">{percent}%</span>
          </div>
          <Button
            variant={a.variant}
            onClick={onOpen}
            className="w-full justify-center gap-1.5 py-2.5 text-[13.5px]"
          >
            {a.icon && <Play className="size-[15px]" fill="currentColor" strokeWidth={0} />}
            {a.label}
          </Button>
        </div>
      </div>
    </article>
  );
}
