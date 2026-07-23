"use client";

import { Check, ChevronDown, Lock, X } from "lucide-react";

import { LESSON_ICON } from "@/components/icons";
import { ProgressBar } from "@/components/primitives/progress-bar";
import {
  coursePercent,
  isLessonLocked,
  lessonStatus,
  moduleCounts,
} from "@/lib/progress";
import type { Completion, Course, Lesson } from "@/lib/types";
import { cn } from "@/lib/utils";

export type SidebarStyle = "detailed" | "compact" | "numbered";

export function CurriculumSidebar({
  course,
  completion,
  currentLessonId,
  sidebarStyle,
  sequentialLocking,
  expanded,
  isNarrow,
  onToggleModule,
  onSelectLesson,
  onClose,
}: {
  course: Course;
  completion: Completion;
  currentLessonId: string;
  sidebarStyle: SidebarStyle;
  sequentialLocking: boolean;
  expanded: Record<string, boolean>;
  isNarrow: boolean;
  onToggleModule: (moduleId: string) => void;
  onSelectLesson: (lessonId: string) => void;
  onClose: () => void;
}) {
  const width = sidebarStyle === "compact" ? 308 : 340;
  const coursePct = coursePercent(course, completion);

  const wrapperStyle: React.CSSProperties = isNarrow
    ? {
        position: "absolute",
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 50,
        width: Math.min(width, 340),
        maxWidth: "86vw",
      }
    : {
        width,
        flex: "none",
      };

  let counter = 0;

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-line-strong bg-surface-warm",
        isNarrow && "shadow-[0_20px_60px_-20px_rgba(0,0,0,0.3)] dark:shadow-none",
      )}
      style={wrapperStyle}
    >
      {/* header block */}
      <div className="flex-none border-b border-line-divider px-[18px] pb-4 pt-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="mb-1.5 text-[10.5px] tracking-[0.04em] text-brand">
              {course.category}
            </div>
            <h2 className="mb-[3px] text-[19px] font-semibold leading-[1.18]">
              {course.title}
            </h2>
          </div>
          {isNarrow && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close curriculum"
              className="flex size-[30px] flex-none items-center justify-center rounded-lg text-ink-3 hover:bg-hover-surface-2"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="mt-4 flex items-center gap-2.5">
          <ProgressBar
            percent={coursePct}
            trackClassName="h-[6px] bg-track-side"
          />
          <span className="text-[12px] text-ink-2">{coursePct}%</span>
        </div>
      </div>

      {/* modules */}
      <div className="flex-1 overflow-y-auto px-2 pb-6 pt-2">
        {course.modules.map((mod, mi) => {
          const { done, total } = moduleCounts(course, mod.id, completion);
          const isOpen = !!expanded[mod.id];
          return (
            <div key={mod.id} className="mb-0.5">
              <button
                type="button"
                onClick={() => onToggleModule(mod.id)}
                className="flex w-full items-center gap-[11px] rounded-[9px] px-2.5 py-[11px] text-left hover:bg-hover-surface-2"
              >
                <span className="w-[18px] flex-none text-[11px] text-ink-faint">
                  {(mi < 9 ? "0" : "") + (mi + 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold leading-[1.25] text-ink">
                    {mod.title}
                  </span>
                </span>
                <span className="flex-none text-[11px] text-ink-faint">
                  {done}/{total}
                </span>
                <span
                  className="flex flex-none text-ink-faint transition-transform duration-200"
                  style={{ transform: `rotate(${isOpen ? 180 : 0}deg)` }}
                >
                  <ChevronDown className="size-4" />
                </span>
              </button>

              {isOpen && (
                <div className="pb-2 pt-0.5">
                  {mod.lessons.map((lesson) => {
                    counter++;
                    const num = (counter < 10 ? "0" : "") + counter;
                    return (
                      <LessonRow
                        key={lesson.id}
                        lesson={lesson}
                        number={num}
                        sidebarStyle={sidebarStyle}
                        isCurrent={lesson.id === currentLessonId}
                        isDone={lessonStatus(completion, lesson.id) === "completed"}
                        locked={isLessonLocked(
                          course,
                          lesson.id,
                          completion,
                          currentLessonId,
                          sequentialLocking,
                        )}
                        onSelect={() => onSelectLesson(lesson.id)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function LessonRow({
  lesson,
  number,
  sidebarStyle,
  isCurrent,
  isDone,
  locked,
  onSelect,
}: {
  lesson: Lesson;
  number: string;
  sidebarStyle: SidebarStyle;
  isCurrent: boolean;
  isDone: boolean;
  locked: boolean;
  onSelect: () => void;
}) {
  const Icon = LESSON_ICON;
  const showNumber = sidebarStyle === "numbered";

  const titleColor = locked ? "var(--ink-faint)" : isCurrent ? "var(--ink)" : "var(--ink-btn)";

  const rowStyle: React.CSSProperties = {
    padding: sidebarStyle === "compact" ? "7px 9px" : "9px 9px",
    background: isCurrent ? "var(--brand-soft)" : "transparent",
    boxShadow: isCurrent ? "inset 2px 0 0 var(--brand)" : undefined,
    opacity: locked ? 0.55 : 1,
    cursor: locked ? "default" : "pointer",
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={locked}
      className={cn(
        "flex w-full items-center gap-[11px] rounded-[9px] text-left",
        !locked && !isCurrent && "hover:bg-hover-surface-2",
      )}
      style={rowStyle}
    >
      <span
        className="flex size-[26px] flex-none items-center justify-center rounded-[7px]"
        style={
          isCurrent
            ? { background: "var(--brand)", color: "var(--brand-contrast)" }
            : isDone
              ? { background: "var(--surface)", color: "var(--brand)", border: "1px solid var(--ring-conic)" }
              : { background: "var(--hover-surface-2)", color: "var(--ink-3)" }
        }
      >
        {showNumber ? (
          <span className="text-[11px]">{number}</span>
        ) : (
          <Icon className="size-[15px]" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className="block overflow-hidden text-ellipsis whitespace-nowrap text-[13px] leading-[1.3]"
          style={{ color: titleColor, fontWeight: isCurrent ? 600 : 500 }}
        >
          {lesson.title}
        </span>
      </span>

      <span className="flex size-5 flex-none items-center justify-center">
        {isDone ? (
          <span className="flex size-[18px] items-center justify-center rounded-full bg-brand text-brand-contrast">
            <Check className="size-[11px]" strokeWidth={2.4} />
          </span>
        ) : isCurrent ? (
          <span className="animate-pulse-dot size-[9px] rounded-full bg-brand" />
        ) : locked ? (
          <Lock className="size-[14px] text-ink-faintest" />
        ) : null}
      </span>
    </button>
  );
}
