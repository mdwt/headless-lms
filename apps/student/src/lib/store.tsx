"use client";

// App-wide client state: per-course completion (source of progress math), a
// toast, and the accent knob. Completion is seeded from the server (hydration)
// and advanced locally as the player reports progress via the SDK.
import * as React from "react";
import type { Completion, LessonStatus } from "./types";

export type Accent = "indigo" | "emerald" | "orange" | "ink";

interface ToastState {
  id: number;
  message: string;
}

interface AppState {
  completionByCourse: Record<string, Completion>;
  setLessonStatus: (courseId: string, lessonId: string, status: LessonStatus) => void;
  seedCompletion: (courseId: string, completion: Completion) => void;
  markOpened: (courseId: string, lessonId: string) => void;
  toast: ToastState | null;
  showToast: (message: string) => void;
  accent: Accent;
  setAccent: (a: Accent) => void;
}

const AppContext = React.createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [completionByCourse, setCompletion] = React.useState<Record<string, Completion>>({});
  const [toast, setToast] = React.useState<ToastState | null>(null);
  const [accent, setAccent] = React.useState<Accent>("indigo");
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = React.useCallback((message: string) => {
    setToast({ id: Date.now(), message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const setLessonStatus = React.useCallback(
    (courseId: string, lessonId: string, status: LessonStatus) => {
      setCompletion((prev) => ({
        ...prev,
        [courseId]: { ...(prev[courseId] ?? {}), [lessonId]: status },
      }));
    },
    [],
  );

  const seedCompletion = React.useCallback((courseId: string, completion: Completion) => {
    setCompletion((prev) => ({ ...prev, [courseId]: { ...completion, ...(prev[courseId] ?? {}) } }));
  }, []);

  /** Promote to in-progress only if not started — never demotes a seeded/completed status. */
  const markOpened = React.useCallback((courseId: string, lessonId: string) => {
    setCompletion((prev) => {
      const cur = prev[courseId]?.[lessonId] ?? "not-started";
      if (cur !== "not-started") return prev;
      return { ...prev, [courseId]: { ...(prev[courseId] ?? {}), [lessonId]: "in-progress" } };
    });
  }, []);

  const value: AppState = {
    completionByCourse,
    setLessonStatus,
    seedCompletion,
    markOpened,
    toast,
    showToast,
    accent,
    setAccent,
  };

  return (
    <AppContext.Provider value={value}>
      <div data-accent={accent === "indigo" ? undefined : accent}>{children}</div>
    </AppContext.Provider>
  );
}

export function useApp(): AppState {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function useCompletion(courseId: string): Completion {
  const { completionByCourse } = useApp();
  return completionByCourse[courseId] ?? {};
}
