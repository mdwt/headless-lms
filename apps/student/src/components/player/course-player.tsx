"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { initials } from "@/lib/format";
import {
  adjacentLesson,
  coursePercent,
  completedCount,
  findLesson,
  flattenLessons,
  isCourseCompleted,
  isLessonLocked,
  lessonStatus,
  moduleOfLesson,
  totalLessons,
} from "@/lib/progress";
import { useApp, useCompletion } from "@/lib/store";
import type { Course } from "@/lib/types";

import { PlayerHeader } from "./player-header";
import { CurriculumSidebar, type SidebarStyle } from "./curriculum-sidebar";
import { FooterNav } from "./footer-nav";
import { ContentArea } from "./content/content-area";
import { useIsNarrow } from "./use-viewport";

export interface CoursePlayerProps {
  course: Course;
  studentName: string;
  /** Server-rendered activity content, keyed by lesson id (see render-activity). */
  renderedContent: Record<string, React.ReactNode>;
  sidebarStyle?: SidebarStyle;
  sequentialLocking?: boolean;
  autoAdvance?: boolean;
}

const AUTO_ADVANCE_MS = 420;

export function CoursePlayer({
  course,
  studentName,
  renderedContent,
  sidebarStyle = "detailed",
  sequentialLocking = true,
  autoAdvance = true,
}: CoursePlayerProps) {
  const router = useRouter();
  const { toggleComplete, showToast } = useApp();
  const completion = useCompletion(course.id);
  const isNarrow = useIsNarrow();

  const flat = React.useMemo(() => flattenLessons(course), [course]);
  const firstLessonId = flat[0]?.id ?? "";

  const [lessonId, setLessonId] = React.useState(firstLessonId);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>(() => {
    const mod = moduleOfLesson(course, firstLessonId);
    return mod ? { [mod.id]: true } : {};
  });
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [mobileSidebar, setMobileSidebar] = React.useState(false);

  const curLesson = findLesson(course, lessonId) ?? flat[0];
  // A course may have no student-visible lessons (every activity a draft). Keep a
  // safe id so hooks/derived values never dereference an undefined lesson; the
  // render falls back to an empty state below.
  const curLessonId = curLesson?.id ?? "";
  const curIdx = flat.findIndex((l) => l.id === curLessonId);

  const goToLesson = React.useCallback(
    (id: string) => {
      const mod = moduleOfLesson(course, id);
      setLessonId(id);
      setExpanded((e) => (mod ? { ...e, [mod.id]: true } : e));
    },
    [course],
  );

  const selectLesson = React.useCallback(
    (id: string) => {
      const locked = isLessonLocked(course, id, completion, curLessonId, sequentialLocking);
      if (locked) return;
      goToLesson(id);
      setMobileSidebar(false);
    },
    [course, completion, curLessonId, sequentialLocking, goToLesson],
  );

  const goNext = React.useCallback(
    (fromComplete: boolean) => {
      const nxt = adjacentLesson(course, curLessonId, 1);
      if (nxt) {
        goToLesson(nxt.id);
      } else if (fromComplete) {
        showToast("Course complete — nicely done");
      }
    },
    [course, curLessonId, goToLesson, showToast],
  );

  const goPrev = React.useCallback(() => {
    const prv = adjacentLesson(course, curLessonId, -1);
    if (prv) goToLesson(prv.id);
  }, [course, curLessonId, goToLesson]);

  const markComplete = React.useCallback(() => {
    const wasDone = lessonStatus(completion, curLessonId) === "completed";
    toggleComplete(course.id, curLessonId);
    if (!wasDone) {
      showToast("Lesson completed");
      if (autoAdvance) {
        window.setTimeout(() => goNext(true), AUTO_ADVANCE_MS);
      }
    }
  }, [completion, curLessonId, toggleComplete, course.id, showToast, autoAdvance, goNext]);

  // ---- derived ----
  const coursePct = coursePercent(course, completion);
  const doneCount = completedCount(course, completion);
  const total = totalLessons(course);
  const courseCompleted = isCourseCompleted(course, completion);
  const curStatus = lessonStatus(completion, curLessonId);
  const isCompleted = curStatus === "completed";

  const sidebarShownDesktop = !isNarrow && sidebarOpen;
  const sidebarShownMobile = isNarrow && mobileSidebar;
  const showSidebar = sidebarShownDesktop || sidebarShownMobile;

  const toggleSidebar = () => {
    if (isNarrow) setMobileSidebar((v) => !v);
    else setSidebarOpen((v) => !v);
  };
  const sidebarToggleActive = isNarrow ? mobileSidebar : sidebarOpen;

  const onBack = () => router.push("/");

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PlayerHeader
        courseTitle={course.title}
        coursePercent={coursePct}
        doneCount={doneCount}
        total={total}
        studentInitials={initials(studentName)}
        sidebarActive={sidebarToggleActive}
        onBack={onBack}
        onToggleSidebar={toggleSidebar}
      />

      {flat.length === 0 ? (
        <div className="grid flex-1 place-items-center px-6 text-center">
          <p className="max-w-sm text-[14px] text-ink-3">
            This course has no published lessons yet.
          </p>
        </div>
      ) : (
      <div className="relative flex min-h-0 flex-1">
        {showSidebar && sidebarShownMobile && (
          <div
            onClick={() => setMobileSidebar(false)}
            className="absolute inset-0 z-40"
            style={{ background: "rgba(20,20,18,0.4)" }}
            aria-hidden
          />
        )}

        {showSidebar && (
          <CurriculumSidebar
            course={course}
            completion={completion}
            currentLessonId={curLessonId}
            sidebarStyle={sidebarStyle}
            sequentialLocking={sequentialLocking}
            expanded={expanded}
            isNarrow={isNarrow}
            onToggleModule={(id) => setExpanded((e) => ({ ...e, [id]: !e[id] }))}
            onSelectLesson={selectLesson}
            onClose={() => setMobileSidebar(false)}
          />
        )}

        <main className="flex min-w-0 flex-1 flex-col" style={{ background: "#faf9f6" }}>
          <div className="flex-1 overflow-y-auto">
            {courseCompleted && (
              <div
                className="flex items-center gap-[11px] border-b px-6 py-[13px]"
                style={{
                  background: "var(--brand-soft)",
                  borderColor: "var(--brand)",
                  color: "var(--brand-strong)",
                }}
              >
                <span className="text-[13.5px] font-semibold">
                  You&apos;ve completed this course. Revisit any lesson anytime.
                </span>
              </div>
            )}
            <ContentArea node={curLesson ? renderedContent[curLessonId] : null} />
          </div>

          <FooterNav
            isCompleted={isCompleted}
            prevDisabled={curIdx <= 0}
            nextDisabled={curIdx >= flat.length - 1}
            onPrev={goPrev}
            onNext={() => goNext(false)}
            onMarkComplete={markComplete}
          />
        </main>
      </div>
      )}
    </div>
  );
}
