"use client";

// App-wide client state the prototype keeps in component state: per-course
// completion (source of progress math), a toast, and the accent knob.
// Swap markLessonComplete for a real mutation when wiring the API.
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
  toggleComplete: (courseId: string, lessonId: string) => LessonStatus;
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

  const toggleComplete = React.useCallback(
    (courseId: string, lessonId: string): LessonStatus => {
      const current = completionByCourse[courseId]?.[lessonId] ?? "not-started";
      const next: LessonStatus = current === "completed" ? "in-progress" : "completed";
      setLessonStatus(courseId, lessonId, next);
      return next;
    },
    [completionByCourse, setLessonStatus],
  );

  const value: AppState = {
    completionByCourse,
    setLessonStatus,
    toggleComplete,
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
