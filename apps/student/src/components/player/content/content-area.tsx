"use client";

import { Check } from "lucide-react";

import { moduleOfLesson } from "@/lib/progress";
import type { Course, Lesson, LessonStatus } from "@/lib/types";
import type { QuizState } from "../course-player";

import { Overview } from "./overview";
import { VideoLesson } from "./video";
import { AudioLesson } from "./audio";
import { TextLesson } from "./text";
import { PdfLesson } from "./pdf";
import { DownloadLesson } from "./download";
import { QuizLesson } from "./quiz";

export interface ContentMedia {
  playing: boolean;
  t: number;
}

export function ContentArea({
  course,
  lesson,
  status,
  courseCompleted,
  isNarrow,
  media,
  onTogglePlay,
  pdfPage,
  onPdfPrev,
  onPdfNext,
  onDownload,
  quiz,
  onQuizSelect,
  onQuizSubmit,
  onQuizReset,
}: {
  course: Course;
  lesson: Lesson;
  status: LessonStatus;
  courseCompleted: boolean;
  isNarrow: boolean;
  media: ContentMedia;
  onTogglePlay: () => void;
  pdfPage: number;
  onPdfPrev: () => void;
  onPdfNext: () => void;
  onDownload: () => void;
  quiz: QuizState;
  onQuizSelect: (qi: number, oi: number) => void;
  onQuizSubmit: () => void;
  onQuizReset: () => void;
}) {
  const contentMax =
    lesson.type === "text" ? 720 : lesson.type === "video" ? 940 : 820;
  const padding = isNarrow ? "20px 18px 28px" : "30px 34px 36px";

  const letter = course.title.replace(/^The\s+/, "")[0] ?? course.title[0] ?? "";
  const moduleIndex = course.modules.findIndex((m) =>
    m.lessons.some((l) => l.id === lesson.id),
  );
  const moduleTitle = moduleOfLesson(course, lesson.id)?.title ?? "";

  const showOverview = lesson.type === "video" || lesson.type === "audio";

  return (
    <>
      {courseCompleted && (
        <div
          className="flex items-center gap-[11px] border-b px-6 py-[13px]"
          style={{
            background: "var(--brand-soft)",
            borderColor: "var(--brand)",
            color: "var(--brand-strong)",
          }}
        >
          <span className="flex size-6 flex-none items-center justify-center rounded-full bg-brand text-white">
            <Check className="size-[14px]" strokeWidth={2.4} />
          </span>
          <span className="text-[13.5px] font-semibold">
            You&apos;ve completed this course. Revisit any lesson, or download your
            certificate.
          </span>
        </div>
      )}

      <div style={{ maxWidth: contentMax, margin: "0 auto", padding }}>
        {lesson.type === "video" && (
          <VideoLesson
            tone={course.tone}
            letter={letter}
            durationSeconds={lesson.durationSeconds}
            playing={media.playing}
            t={media.t}
            onTogglePlay={onTogglePlay}
          />
        )}
        {lesson.type === "audio" && (
          <AudioLesson
            title={lesson.title}
            durationSeconds={lesson.durationSeconds}
            playing={media.playing}
            t={media.t}
            onTogglePlay={onTogglePlay}
          />
        )}
        {lesson.type === "text" && <TextLesson content={lesson.content} />}
        {lesson.type === "pdf" && (
          <PdfLesson
            fileName={lesson.content.fileName ?? "Worksheet.pdf"}
            page={pdfPage}
            pageCount={lesson.content.pageCount ?? 6}
            onPrev={onPdfPrev}
            onNext={onPdfNext}
            onDownload={onDownload}
          />
        )}
        {lesson.type === "download" && (
          <DownloadLesson
            fileName={lesson.content.fileName ?? "Files.zip"}
            fileMeta={lesson.content.fileMeta ?? "ZIP"}
            onDownload={onDownload}
          />
        )}
        {lesson.type === "quiz" && (
          <QuizLesson
            questions={lesson.content.questions ?? []}
            quiz={quiz}
            onSelect={onQuizSelect}
            onSubmit={onQuizSubmit}
            onReset={onQuizReset}
          />
        )}

        {showOverview && (
          <Overview
            lesson={lesson}
            status={status}
            moduleLabel={`Module ${moduleIndex + 1} · ${moduleTitle}`}
            onDownload={onDownload}
          />
        )}
      </div>
    </>
  );
}
