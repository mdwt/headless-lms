"use client";

import { Play } from "lucide-react";
import type { CourseSummaryVM } from "@/lib/types";
import { CourseCover } from "@/components/primitives/course-cover";
import { coverLetter } from "@/lib/covers";
import { ProgressBar } from "@/components/primitives/progress-bar";
import { Button } from "@/components/ui/button";

/** "Continue learning" resume hero (handoff §3). */
export function ContinueHero({
  course,
  percent,
  resumeLabel,
  lessonsLeft,
  onContinue,
}: {
  course: CourseSummaryVM;
  percent: number;
  resumeLabel: string;
  lessonsLeft: number;
  onContinue: () => void;
}) {
  return (
    <section className="mb-[38px] flex overflow-hidden rounded-[20px] border border-line bg-surface max-[900px]:flex-col">
      <CourseCover
        tone={course.tone}
        category={course.category}
        letter={coverLetter(course.title)}
        className="flex w-[300px] shrink-0 flex-col justify-between p-[26px] max-[900px]:h-[180px] max-[900px]:w-full"
        eyebrowClassName="text-[11px] text-white/[0.72]"
        letterClassName="text-[150px] -right-1 -bottom-[30px]"
      >
        <h2 className="relative z-[1] mt-auto max-w-[84%] text-[27px] font-semibold leading-[1.12] text-white">
          {course.title}
        </h2>
      </CourseCover>

      <div className="flex min-w-0 flex-1 flex-col justify-center px-7 py-[26px]">
        <div className="mb-3 text-[11px] tracking-[0.04em] text-brand">Pick up where you left off</div>
        <h3 className="mb-1.5 text-[24px] font-semibold tracking-[-0.01em]">{course.title}</h3>
        <div className="mb-5 text-[14.5px] text-ink-2">{resumeLabel}</div>
        <div className="mb-[22px] flex max-w-[440px] items-center gap-3.5">
          <ProgressBar percent={percent} trackClassName="h-[7px]" />
          <span className="text-[13px] text-ink-2">{percent}%</span>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="brand" size="pill" onClick={onContinue} className="gap-[9px]">
            <Play className="size-[17px]" fill="currentColor" strokeWidth={0} />
            Continue learning
          </Button>
          <span className="text-[13.5px] text-ink-3">{lessonsLeft} lessons left</span>
        </div>
      </div>
    </section>
  );
}
