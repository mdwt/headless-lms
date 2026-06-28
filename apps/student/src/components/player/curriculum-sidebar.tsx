"use client";

import { Check, ChevronDown, Lock, X } from "lucide-react";

import { LESSON_ICON } from "@/components/icons";
import { ProgressBar } from "@/components/primitives/progress-bar";
import { durationLabel } from "@/lib/format";
import {
  coursePercent,
  isLessonLocked,
  lessonStatus,
  moduleCounts,
} from "@/lib/progress";
import type { Completion, Course, Lesson } from "@/lib/types";
import { cn } from "@/lib/utils";

export type SidebarStyle = "detailed" | "compact" | "numbered";

/** Short sidebar meta label per lesson type (handoff §9 / prototype durShort). */
function metaLabel(lesson: Lesson): string {
  switch (lesson.type) {
    case "video":
    case "audio":
      return durationLabel(lesson.durationSeconds);
    case "text":
      return `${Math.round(lesson.durationSeconds / 60)} min`;
    case "quiz":
      return "Quiz";
    case "pdf":
      return "PDF";
    case "download":
      return "Files";
    default:
      return "";
  }
}

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
        background: "#fbfaf8",
        borderRight: "1px solid #eae8e2",
        boxShadow: "0 20px 60px -20px rgba(0,0,0,0.3)",
      }
    : {
        width,
        flex: "none",
        background: "#fbfaf8",
        borderRight: "1px solid #eae8e2",
      };

  let counter = 0;

  return (
    <aside className="flex flex-col" style={wrapperStyle}>
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
            <div className="text-[12.5px] text-ink-3">with {course.instructor}</div>
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
                  <span
                    className="block text-[13.5px] font-semibold leading-[1.25]"
                    style={{ color: "#33312c" }}
                  >
                    {mod.title}
                  </span>
                </span>
                <span className="flex-none text-[11px]" style={{ color: "#a8a499" }}>
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
  const Icon = LESSON_ICON[lesson.type];
  const showMeta = sidebarStyle !== "compact";
  const showNumber = sidebarStyle === "numbered";

  const titleColor = locked ? "#a8a499" : isCurrent ? "#1b1b19" : "#403e38";

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
            ? { background: "var(--brand)", color: "#fff" }
            : isDone
              ? { background: "#fff", color: "var(--brand)", border: "1px solid #e6e3dc" }
              : { background: "#f1efe9", color: "#9a978d" }
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
        {showMeta && (
          <span
            className="mt-0.5 block text-[10.5px]"
            style={{ color: "#a8a499" }}
          >
            {metaLabel(lesson)}
          </span>
        )}
      </span>

      <span className="flex size-5 flex-none items-center justify-center">
        {isDone ? (
          <span className="flex size-[18px] items-center justify-center rounded-full bg-brand text-white">
            <Check className="size-[11px]" strokeWidth={2.4} />
          </span>
        ) : isCurrent ? (
          <span className="animate-pulse-dot size-[9px] rounded-full bg-brand" />
        ) : locked ? (
          <Lock className="size-[14px]" style={{ color: "#c2bfb5" }} />
        ) : null}
      </span>
    </button>
  );
}
