import Link from "next/link";
import { Play } from "lucide-react";

import { cn } from "@/lib/utils";
import { courseHref, type CourseView } from "@/lib/dashboard";
import { CourseCover } from "@/components/primitives/course-cover";
import { coverLetter } from "@/lib/covers";
import { ProgressBar } from "@/components/primitives/progress-bar";
import { StatusChip, ExpiredPill } from "@/components/primitives/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { courseAction } from "./course-action";

/** Course row — list layout (handoff §5). Same stretched-link treatment as the card. */
export function CourseListRow({ course, percent, state }: CourseView) {
  const expired = state === "expired";
  const action = courseAction(state);
  return (
    <article
      className={cn(
        "relative flex overflow-hidden rounded-[14px] border border-line bg-surface transition-[box-shadow,border-color] duration-200",
        "hover:border-line-hover hover:shadow-[0_8px_22px_-16px_rgba(20,20,18,0.26)] dark:hover:shadow-none",
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
            {expired && <ExpiredPill className="!bg-track-side !text-ink-3 !backdrop-blur-none" />}
          </div>
          <div className="truncate text-[13px] text-ink-3">{course.category}</div>
        </div>
        <div className="w-[160px] flex-none">
          <div className="flex items-center gap-[9px]">
            <ProgressBar
              percent={percent}
              fillClassName={expired ? "bg-expired-bar" : "bg-brand"}
            />
            <span className="text-[12px] text-ink-3">{percent}%</span>
          </div>
        </div>
        <Link
          href={courseHref(course.id)}
          aria-label={`${action.label} ${course.title}`}
          className={cn(
            buttonVariants({ variant: action.variant, size: "pillSm" }),
            "flex-none gap-1.5",
            "after:absolute after:inset-0 after:z-10 after:content-['']",
          )}
        >
          {action.icon && <Play className="size-[15px]" fill="currentColor" strokeWidth={0} />}
          {action.label}
        </Link>
      </div>
    </article>
  );
}
