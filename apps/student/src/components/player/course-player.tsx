"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { getCourse, getEnrollment, student } from "@/lib/mock-data";
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
import { ExpiredGate } from "./expired-gate";
import { useIsNarrow } from "./use-viewport";

export interface QuizState {
  answers: Record<number, number>;
  submitted: boolean;
}

interface MediaState {
  playing: boolean;
  t: number;
  lessonId: string | null;
}

export interface CoursePlayerProps {
  courseId: string;
  sidebarStyle?: SidebarStyle;
  sequentialLocking?: boolean;
  autoAdvance?: boolean;
}

const MEDIA_TICK_MS = 200;
const MEDIA_TICK_SECONDS = 3;
const AUTO_ADVANCE_MS = 420;

export function CoursePlayer({
  courseId,
  sidebarStyle = "detailed",
  sequentialLocking = true,
  autoAdvance = true,
}: CoursePlayerProps) {
  const router = useRouter();
  const course = getCourse(courseId);
  const enrollment = getEnrollment(courseId);
  const { toggleComplete, setLessonStatus, showToast } = useApp();
  const completion = useCompletion(courseId);
  const isNarrow = useIsNarrow();

  // Enrollment gate: opening an expired course shows the gate until renewed.
  const [renewed, setRenewed] = React.useState(false);
  const expired = enrollment?.status === "expired" && !renewed;

  if (!course) {
    return (
      <div className="grid min-h-screen place-items-center text-ink-3">
        Course not found.
      </div>
    );
  }

  if (expired) {
    return (
      <ExpiredGate
        course={course}
        enrollment={enrollment}
        completion={completion}
        onBack={() => router.push("/")}
        onRenew={() => {
          setRenewed(true);
          showToast("Enrollment renewed");
        }}
      />
    );
  }

  return (
    <PlayerInner
      course={course}
      initialLessonId={enrollment?.lastAccessedLessonId ?? null}
      isNarrow={isNarrow}
      sidebarStyle={sidebarStyle}
      sequentialLocking={sequentialLocking}
      autoAdvance={autoAdvance}
      completion={completion}
      toggleComplete={toggleComplete}
      setLessonStatus={setLessonStatus}
      showToast={showToast}
      onBack={() => router.push("/")}
    />
  );
}

function PlayerInner({
  course,
  initialLessonId,
  isNarrow,
  sidebarStyle,
  sequentialLocking,
  autoAdvance,
  completion,
  toggleComplete,
  setLessonStatus,
  showToast,
  onBack,
}: {
  course: Course;
  initialLessonId: string | null;
  isNarrow: boolean;
  sidebarStyle: SidebarStyle;
  sequentialLocking: boolean;
  autoAdvance: boolean;
  completion: ReturnType<typeof useCompletion>;
  toggleComplete: ReturnType<typeof useApp>["toggleComplete"];
  setLessonStatus: ReturnType<typeof useApp>["setLessonStatus"];
  showToast: (m: string) => void;
  onBack: () => void;
}) {
  const flat = React.useMemo(() => flattenLessons(course), [course]);

  const firstLessonId = flat[0]?.id ?? "";
  const validInitial =
    initialLessonId && flat.some((l) => l.id === initialLessonId)
      ? initialLessonId
      : firstLessonId;

  const [lessonId, setLessonId] = React.useState(validInitial);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>(() => {
    const mod = moduleOfLesson(course, validInitial);
    return mod ? { [mod.id]: true } : {};
  });
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [mobileSidebar, setMobileSidebar] = React.useState(false);
  const [media, setMedia] = React.useState<MediaState>({
    playing: false,
    t: 0,
    lessonId: null,
  });
  const [pdfPage, setPdfPage] = React.useState(1);
  const [quizByLesson, setQuizByLesson] = React.useState<Record<string, QuizState>>(
    {},
  );

  const mediaTimer = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const stopMedia = React.useCallback(() => {
    if (mediaTimer.current) {
      clearInterval(mediaTimer.current);
      mediaTimer.current = null;
    }
  }, []);
  React.useEffect(() => stopMedia, [stopMedia]);

  const curLesson = findLesson(course, lessonId) ?? flat[0];
  const curIdx = flat.findIndex((l) => l.id === curLesson.id);

  const goToLesson = React.useCallback(
    (id: string) => {
      stopMedia();
      const mod = moduleOfLesson(course, id);
      setLessonId(id);
      setExpanded((e) => (mod ? { ...e, [mod.id]: true } : e));
      setMedia({ playing: false, t: 0, lessonId: id });
      setPdfPage(1);
    },
    [course, stopMedia],
  );

  const selectLesson = React.useCallback(
    (id: string) => {
      const locked = isLessonLocked(
        course,
        id,
        completion,
        curLesson.id,
        sequentialLocking,
      );
      if (locked) return;
      goToLesson(id);
      setMobileSidebar(false);
    },
    [course, completion, curLesson.id, sequentialLocking, goToLesson],
  );

  const goNext = React.useCallback(
    (fromComplete: boolean) => {
      const nxt = adjacentLesson(course, curLesson.id, 1);
      if (nxt) {
        goToLesson(nxt.id);
      } else if (fromComplete) {
        showToast("Course complete — nicely done");
      }
    },
    [course, curLesson.id, goToLesson, showToast],
  );

  const goPrev = React.useCallback(() => {
    const prv = adjacentLesson(course, curLesson.id, -1);
    if (prv) goToLesson(prv.id);
  }, [course, curLesson.id, goToLesson]);

  const markComplete = React.useCallback(() => {
    const wasDone = lessonStatus(completion, curLesson.id) === "completed";
    toggleComplete(course.id, curLesson.id);
    if (!wasDone) {
      showToast("Lesson completed");
      if (autoAdvance) {
        window.setTimeout(() => goNext(true), AUTO_ADVANCE_MS);
      }
    }
  }, [completion, curLesson.id, toggleComplete, course.id, showToast, autoAdvance, goNext]);

  const togglePlay = React.useCallback(() => {
    const dur = curLesson.durationSeconds;
    const playingThis = media.playing && media.lessonId === curLesson.id;
    if (playingThis) {
      stopMedia();
      setMedia((s) => ({ ...s, playing: false }));
      return;
    }
    setMedia((s) => ({ ...s, playing: true, lessonId: curLesson.id }));
    stopMedia();
    mediaTimer.current = setInterval(() => {
      setMedia((s) => {
        const t = s.t + MEDIA_TICK_SECONDS;
        if (t >= dur) {
          stopMedia();
          return { ...s, t: dur, playing: false };
        }
        return { ...s, t };
      });
    }, MEDIA_TICK_MS);
  }, [curLesson.durationSeconds, curLesson.id, media.playing, media.lessonId, stopMedia]);

  const onDownload = React.useCallback(() => showToast("Download started"), [showToast]);

  // ---- quiz handlers ----
  const quizState = quizByLesson[curLesson.id] ?? { answers: {}, submitted: false };
  const quizSelect = React.useCallback(
    (qi: number, oi: number) => {
      setQuizByLesson((prev) => {
        const qs = prev[curLesson.id] ?? { answers: {}, submitted: false };
        if (qs.submitted) return prev;
        return {
          ...prev,
          [curLesson.id]: { ...qs, answers: { ...qs.answers, [qi]: oi } },
        };
      });
    },
    [curLesson.id],
  );
  const quizSubmit = React.useCallback(() => {
    const defs = curLesson.content.questions ?? [];
    const qs = quizByLesson[curLesson.id] ?? { answers: {}, submitted: false };
    if (Object.keys(qs.answers).length < defs.length) return;
    setQuizByLesson((prev) => ({
      ...prev,
      [curLesson.id]: { ...qs, submitted: true },
    }));
    const allCorrect = defs.every((d, i) => {
      const picked = qs.answers[i];
      return picked !== undefined && d.options[picked]?.id === d.correctOptionId;
    });
    if (allCorrect && defs.length > 0) {
      setLessonStatus(course.id, curLesson.id, "completed");
    }
  }, [curLesson, quizByLesson, setLessonStatus, course.id]);
  const quizReset = React.useCallback(() => {
    setQuizByLesson((prev) => ({
      ...prev,
      [curLesson.id]: { answers: {}, submitted: false },
    }));
  }, [curLesson.id]);

  // ---- derived ----
  const coursePct = coursePercent(course, completion);
  const doneCount = completedCount(course, completion);
  const total = totalLessons(course);
  const courseCompleted = isCourseCompleted(course, completion);
  const curStatus = lessonStatus(completion, curLesson.id);
  const isCompleted = curStatus === "completed";

  const sidebarShownDesktop = !isNarrow && sidebarOpen;
  const sidebarShownMobile = isNarrow && mobileSidebar;
  const showSidebar = sidebarShownDesktop || sidebarShownMobile;

  const toggleSidebar = () => {
    if (isNarrow) setMobileSidebar((v) => !v);
    else setSidebarOpen((v) => !v);
  };
  const sidebarToggleActive = isNarrow ? mobileSidebar : sidebarOpen;

  const mainBg = curLesson.type === "video" ? "#f5f4f1" : "#faf9f6";

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PlayerHeader
        courseTitle={course.title}
        coursePercent={coursePct}
        doneCount={doneCount}
        total={total}
        studentInitials={student.initials}
        sidebarActive={sidebarToggleActive}
        onBack={onBack}
        onToggleSidebar={toggleSidebar}
      />

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
            currentLessonId={curLesson.id}
            sidebarStyle={sidebarStyle}
            sequentialLocking={sequentialLocking}
            expanded={expanded}
            isNarrow={isNarrow}
            onToggleModule={(id) =>
              setExpanded((e) => ({ ...e, [id]: !e[id] }))
            }
            onSelectLesson={selectLesson}
            onClose={() => setMobileSidebar(false)}
          />
        )}

        <main
          className="flex min-w-0 flex-1 flex-col"
          style={{ background: mainBg }}
        >
          <div className="flex-1 overflow-y-auto">
            <ContentArea
              course={course}
              lesson={curLesson}
              status={curStatus}
              courseCompleted={courseCompleted}
              isNarrow={isNarrow}
              media={{
                playing: media.playing && media.lessonId === curLesson.id,
                t: media.lessonId === curLesson.id ? media.t : 0,
              }}
              onTogglePlay={togglePlay}
              pdfPage={pdfPage}
              onPdfPrev={() => setPdfPage((p) => Math.max(1, p - 1))}
              onPdfNext={() =>
                setPdfPage((p) =>
                  Math.min(curLesson.content.pageCount ?? 6, p + 1),
                )
              }
              onDownload={onDownload}
              quiz={quizState}
              onQuizSelect={quizSelect}
              onQuizSubmit={quizSubmit}
              onQuizReset={quizReset}
            />
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
    </div>
  );
}
