"use client";

import { ArrowLeft, Clock } from "lucide-react";

import { shortDate } from "@/lib/format";
import { coursePercent } from "@/lib/progress";
import type { Completion, Course, Enrollment } from "@/lib/types";

/** Full-screen expired-enrollment gate (handoff §13). */
export function ExpiredGate({
  course,
  enrollment,
  completion,
  onBack,
  onRenew,
}: {
  course: Course;
  enrollment: Enrollment;
  completion: Completion;
  onBack: () => void;
  onRenew: () => void;
}) {
  const pct = coursePercent(course, completion);
  const expiresLabel = enrollment.expiresAt ? shortDate(enrollment.expiresAt) : "recently";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-line-strong px-6 py-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-[7px] rounded-[9px] px-3 py-2 text-[13.5px] font-medium text-ink-2 hover:bg-hover-surface"
        >
          <ArrowLeft className="size-[17px]" />
          All courses
        </button>
      </header>

      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="max-w-[460px] text-center">
          <div className="mx-auto mb-[22px] flex size-[62px] items-center justify-center rounded-card bg-expired-gate-bg text-expired-gate-fg">
            <Clock className="size-[26px]" />
          </div>
          <h1 className="mb-3 text-[27px] font-semibold tracking-[-0.01em]">
            This enrollment has expired
          </h1>
          <p className="mb-2 text-[15px] leading-[1.6] text-ink-2">
            Your access to{" "}
            <strong className="font-semibold text-ink">{course.title}</strong> ended on{" "}
            {expiresLabel}. You completed {pct}% of the course.
          </p>
          <p className="mb-7 text-[13.5px] text-ink-4">
            Renew to pick up exactly where you left off — your progress is saved.
          </p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="rounded-full border border-line-btn bg-surface px-5 py-3 text-[14px] font-semibold"
              style={{ color: "#4a4843" }}
            >
              Back to library
            </button>
            <button
              type="button"
              onClick={onRenew}
              className="rounded-full bg-brand px-6 py-3 text-[14px] font-semibold text-brand-contrast hover:bg-brand-strong"
            >
              Renew enrollment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
