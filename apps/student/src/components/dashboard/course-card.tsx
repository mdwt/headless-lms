import Link from "next/link";
import { Play } from "lucide-react";

import { cn } from "@/lib/utils";
import { courseHref, type CourseView } from "@/lib/dashboard";
import { CourseCover } from "@/components/primitives/course-cover";
import { coverLetter } from "@/lib/covers";
import { ProgressBar } from "@/components/primitives/progress-bar";
import { CompletedPill, ExpiredPill } from "@/components/primitives/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { courseAction } from "./course-action";

/** Course card — grid layout (handoff §5). The action link is stretched over
 *  the whole card, so the card is one link rather than a click handler. */
export function CourseCard({ course, percent, state }: CourseView) {
  const expired = state === "expired";
  const action = courseAction(state);
  return (
    <article
      className={cn(
        "relative flex flex-col overflow-hidden rounded-card border border-line bg-surface transition-[transform,box-shadow,border-color] duration-200",
        "hover:-translate-y-[3px] hover:border-line-hover hover:shadow-[0_12px_30px_-18px_rgba(20,20,18,0.28)] dark:hover:shadow-none",
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
          <Link
            href={courseHref(course.id)}
            aria-label={`${action.label} ${course.title}`}
            className={cn(
              buttonVariants({ variant: action.variant }),
              "w-full justify-center gap-1.5 py-2.5 text-[13.5px]",
              "after:absolute after:inset-0 after:z-10 after:content-['']",
            )}
          >
            {action.icon && <Play className="size-[15px]" fill="currentColor" strokeWidth={0} />}
            {action.label}
          </Link>
        </div>
      </div>
    </article>
  );
}
