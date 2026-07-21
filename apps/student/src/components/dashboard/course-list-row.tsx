"use client";

import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CourseSummaryVM } from "@/lib/types";
import { CourseCover } from "@/components/primitives/course-cover";
import { coverLetter } from "@/lib/covers";
import { ProgressBar } from "@/components/primitives/progress-bar";
import { StatusChip, ExpiredPill } from "@/components/primitives/status-pill";
import { Button } from "@/components/ui/button";
import type { CourseState } from "./course-card";

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

/** Course row — list layout (handoff §5). */
export function CourseListRow({
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
        "flex cursor-pointer overflow-hidden rounded-[14px] border border-line bg-surface transition-[box-shadow,border-color] duration-200",
        "hover:border-[#ddd9cf] hover:shadow-[0_8px_22px_-16px_rgba(20,20,18,0.26)]",
        expired && "opacity-[0.62]",
      )}
    >
      <CourseCover
        tone={course.tone}
        category={course.category}
        letter={coverLetter(course.title)}
        expired={expired}
        className="w-[150px] shrink-0 self-stretch p-3.5"
        eyebrowClassName="text-[10px]"
        letterClassName="text-[74px] -right-1 -bottom-[18px]"
      />
      <div className="flex min-w-0 flex-1 items-center gap-5 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-[9px]">
            <h3 className="truncate text-[18px] font-semibold">{course.title}</h3>
            {state === "completed" && <StatusChip status="completed" />}
            {expired && <ExpiredPill className="!bg-[#e8e5de] !text-ink-3 !backdrop-blur-none" />}
          </div>
          <div className="truncate text-[13px] text-ink-3">{course.category}</div>
        </div>
        <div className="w-[160px] flex-none">
          <div className="flex items-center gap-[9px]">
            <ProgressBar percent={percent} fillClassName={expired ? "bg-expired-bar" : "bg-brand"} />
            <span className="text-[12px] text-ink-3">{percent}%</span>
          </div>
        </div>
        <Button
          variant={a.variant}
          size="pillSm"
          onClick={onOpen}
          className="flex-none gap-1.5"
        >
          {a.icon && <Play className="size-[15px]" fill="currentColor" strokeWidth={0} />}
          {a.label}
        </Button>
      </div>
    </article>
  );
}
