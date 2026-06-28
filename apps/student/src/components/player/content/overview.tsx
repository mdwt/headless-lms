"use client";

import { Clock, Download } from "lucide-react";

import { LESSON_ICON, LESSON_TYPE_LABEL } from "@/components/icons";
import { timecode } from "@/lib/format";
import type { Lesson, LessonStatus } from "@/lib/types";

const STATUS_LABEL: Record<LessonStatus, string> = {
  completed: "Completed",
  "in-progress": "In progress",
  "not-started": "Not started",
};

function statusChipStyle(status: LessonStatus): React.CSSProperties {
  if (status === "completed")
    return { background: "var(--brand-soft)", color: "var(--brand)" };
  if (status === "in-progress") return { background: "#f3efe2", color: "#a07c2e" };
  return { background: "#f0ede6", color: "#8e8b82" };
}

/** Lesson overview block shown beneath video/audio media (handoff §10). */
export function Overview({
  lesson,
  status,
  moduleLabel,
  onDownload,
}: {
  lesson: Lesson;
  status: LessonStatus;
  moduleLabel: string;
  onDownload: () => void;
}) {
  const Icon = LESSON_ICON[lesson.type];
  const resources = lesson.content.resources ?? [];

  return (
    <div className="mt-[26px]">
      <div className="mb-2.5 text-[11px] tracking-[0.04em] text-brand">{moduleLabel}</div>
      <h1 className="mb-3 text-[30px] font-semibold leading-[1.15] tracking-[-0.015em]">
        {lesson.title}
      </h1>
      <div className="mb-[22px] flex flex-wrap items-center gap-4 text-[13px] text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <Icon className="size-[15px]" />
          {LESSON_TYPE_LABEL[lesson.type]}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-[15px]" />
          {timecode(lesson.durationSeconds)}
        </span>
        <span
          className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[11.5px] font-bold"
          style={statusChipStyle(status)}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>
      {lesson.content.description && (
        <p
          className="mb-3.5 max-w-[62ch] text-[15.5px] leading-[1.68]"
          style={{ color: "#4a4843" }}
        >
          {lesson.content.description}
        </p>
      )}
      {resources.length > 0 && (
        <div className="mt-[18px] flex flex-wrap gap-2.5">
          {resources.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={onDownload}
              className="inline-flex items-center gap-2 rounded-[10px] border border-ring-conic px-3.5 py-[9px] text-[13px] font-medium hover:bg-hover-surface"
              style={{ background: "#fbfaf7", color: "#4a4843" }}
            >
              <Download className="size-[15px] text-brand" />
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
