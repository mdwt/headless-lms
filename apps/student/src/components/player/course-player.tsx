"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { useApp } from "@/lib/store";
import type { Completion, Course, LessonStatus } from "@/lib/types";
import { ensureClientSdk } from "@/lib/api/client-sdk";
import { progressReporter } from "@/lib/progress-reporter";
import {
  createVideoTracker,
  flushKeepalive,
  recordSessionItems,
  type SessionPositions,
  type VideoAssetSeed,
} from "@/lib/video-tracking";
import editorMedia from "@/editor-media.config";
import type { MediaTrackingEvent } from "@headless-lms/editor";
import { Assets } from "@headless-lms/sdk";

import { PlayerHeader } from "./player-header";
import { CurriculumSidebar, type SidebarStyle } from "./curriculum-sidebar";
import { FooterNav } from "./footer-nav";
import { ContentArea } from "./content/content-area";
import { DiscussionPanel } from "./discussion/discussion-panel";
import { useIsNarrow } from "./use-viewport";

export interface CoursePlayerProps {
  course: Course;
  studentName: string;
  orgUserId: string;
  /** Portal org name — the header brand. */
  orgName: string;
  /** Server-rendered activity content, keyed by lesson id (see render-activity). */
  renderedContent: Record<string, ReactNode>;
  /** Server-derived completion — the initial value of the player's own state. */
  initialCompletion?: Completion;
  /** Server-hydrated per-activity position maps (activity id → asset id → state). */
  initialPositions?: Record<string, unknown>;
  /** Where the student left off — server-derived from their progress records. */
  initialLessonId?: string;
  sidebarStyle?: SidebarStyle;
  sequentialLocking?: boolean;
  autoAdvance?: boolean;
}

const AUTO_ADVANCE_MS = 420;

/** Promote a lesson to in-progress only if not started — never demotes a
 *  completed one. Returns the same object when nothing changes. */
function opened(completion: Completion, lessonId: string): Completion {
  if (!lessonId) return completion;
  if ((completion[lessonId] ?? "not-started") !== "not-started") return completion;
  return { ...completion, [lessonId]: "in-progress" };
}

export function CoursePlayer({
  course,
  studentName,
  orgUserId,
  orgName,
  renderedContent,
  initialCompletion,
  initialPositions,
  initialLessonId,
  sidebarStyle = "detailed",
  sequentialLocking = true,
  autoAdvance = true,
}: CoursePlayerProps) {
  const router = useRouter();
  const { showToast } = useApp();
  const isNarrow = useIsNarrow();

  const flat = useMemo(() => flattenLessons(course), [course]);
  const startLessonId =
    (initialLessonId && flat.some((l) => l.id === initialLessonId) ? initialLessonId : null) ??
    flat[0]?.id ??
    "";

  // Completion is this course's, and only the player advances it — so it starts
  // as the server's value rather than being seeded into a global store after
  // mount. Opening the start lesson is part of that initial value, not a
  // post-mount correction, so the first paint is already right.
  const [completion, setCompletion] = useState<Completion>(() =>
    opened(initialCompletion ?? {}, startLessonId),
  );

  const setLessonStatus = useCallback((lessonId: string, status: LessonStatus) => {
    setCompletion((prev) => ({ ...prev, [lessonId]: status }));
  }, []);

  const markOpened = useCallback((lessonId: string) => {
    setCompletion((prev) => opened(prev, lessonId));
  }, []);

  const [lessonId, setLessonId] = useState(startLessonId);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const mod = moduleOfLesson(course, startLessonId);
    return mod ? { [mod.id]: true } : {};
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);

  const curLesson = findLesson(course, lessonId) ?? flat[0];
  // A course may have no student-visible lessons (every activity a draft). Keep a
  // safe id so hooks/derived values never dereference an undefined lesson; the
  // render falls back to an empty state below.
  const curLessonId = curLesson?.id ?? "";
  const curIdx = flat.findIndex((l) => l.id === curLessonId);

  const reporter = useMemo(() => {
    ensureClientSdk();
    return curLessonId ? progressReporter({ activity: curLessonId }) : null;
  }, [curLessonId]);

  // Latest reported state this session, per activity/asset. Preferred over the
  // page-load hydration so within-session navigation never rewinds progress.
  // A stable useState object (never set) rather than a ref: it's read from
  // callbacks the lint can't prove are event-time.
  const [sessionPositions] = useState<SessionPositions>(() => ({}));

  const assetSeed = useCallback(
    (lessonId: string, assetId: string): VideoAssetSeed | undefined => {
      const local = sessionPositions[lessonId]?.[assetId];
      if (local) return local;
      const hydrated = initialPositions?.[lessonId] as
        Record<string, VideoAssetSeed | undefined> | undefined;
      return hydrated?.[assetId];
    },
    [sessionPositions, initialPositions],
  );

  // Fresh tracker per lesson — per-asset watch state must not leak across
  // lessons — seeded with prior state so revisits keep the high-water mark.
  const tracker = useMemo(() => {
    if (!reporter || !curLessonId) return null;
    const lessonId = curLessonId;
    return createVideoTracker({
      send: (items) => {
        recordSessionItems(sessionPositions, lessonId, items);
        void reporter.report(items);
      },
      initial: (assetId) => assetSeed(lessonId, assetId),
    });
  }, [reporter, curLessonId, sessionPositions, assetSeed]);

  const onMediaEvent = useCallback((e: MediaTrackingEvent) => tracker?.handleEvent(e), [tracker]);

  const startPosition = useCallback(
    (assetId: string): number | undefined => {
      const seconds = assetSeed(curLessonId, assetId)?.seconds;
      return typeof seconds === "number" ? seconds : undefined;
    },
    [assetSeed, curLessonId],
  );

  const refreshUrl = useCallback(async (assetId: string): Promise<string | null> => {
    ensureClientSdk();
    try {
      const ticket = await Assets.getAssetDownloadUrl({ id: assetId });
      return ticket.url;
    } catch {
      return null;
    }
  }, []);

  // Flush unsent watch state when the tab hides or the lesson unmounts.
  useEffect(() => {
    if (!tracker || !curLessonId) return;
    const lessonId = curLessonId;
    const flush = () => {
      const items = tracker.flush();
      recordSessionItems(sessionPositions, lessonId, items);
      flushKeepalive(lessonId, items);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [tracker, curLessonId, sessionPositions]);

  // Tell the server the lesson was opened. Purely an outbound side effect —
  // the local status is set by whoever navigated (or by the initial state).
  useEffect(() => {
    if (!curLessonId) return;
    reporter?.opened();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report on lesson change only
  }, [curLessonId]);

  const goToLesson = useCallback(
    (id: string) => {
      const mod = moduleOfLesson(course, id);
      setLessonId(id);
      markOpened(id);
      setExpanded((e) => (mod ? { ...e, [mod.id]: true } : e));
    },
    [course, markOpened],
  );

  const selectLesson = useCallback(
    (id: string) => {
      const locked = isLessonLocked(course, id, completion, curLessonId, sequentialLocking);
      if (locked) return;
      goToLesson(id);
      setMobileSidebar(false);
    },
    [course, completion, curLessonId, sequentialLocking, goToLesson],
  );

  const goNext = useCallback(
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

  const goPrev = useCallback(() => {
    const prv = adjacentLesson(course, curLessonId, -1);
    if (prv) goToLesson(prv.id);
  }, [course, curLessonId, goToLesson]);

  // ---- derived ----
  const coursePct = coursePercent(course, completion);
  const doneCount = completedCount(course, completion);
  const total = totalLessons(course);
  const courseCompleted = isCourseCompleted(course, completion);
  const curStatus = lessonStatus(completion, curLessonId);
  const isCompleted = curStatus === "completed";

  const markComplete = useCallback(() => {
    if (isCompleted || !reporter) return;
    void reporter.completed().then((status) => {
      if (status !== "completed") return;
      setLessonStatus(curLessonId, "completed");
      showToast("Lesson completed");
      if (autoAdvance) {
        window.setTimeout(() => goNext(true), AUTO_ADVANCE_MS);
      }
    });
  }, [isCompleted, reporter, curLessonId, setLessonStatus, showToast, autoAdvance, goNext]);

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
        orgName={orgName}
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

          <main className="flex min-w-0 flex-1 flex-col bg-surface-warm-2">
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
              <editorMedia.MediaProvider
                onEvent={onMediaEvent}
                startPosition={startPosition}
                refreshUrl={refreshUrl}
              >
                <ContentArea node={curLesson ? renderedContent[curLessonId] : null} />
              </editorMedia.MediaProvider>
              {curLessonId && (
                <DiscussionPanel
                  key={curLessonId}
                  activityId={curLessonId}
                  orgUserId={orgUserId}
                  viewerName={studentName}
                />
              )}
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
