// Derived progress — never stored, always computed (handoff "Derived progress").
import type { Completion, Course, Lesson, LessonStatus } from "./types";

export function lessonStatus(completion: Completion, lessonId: string): LessonStatus {
  return completion[lessonId] ?? "not-started";
}

/** Flattened lesson list across modules, in module/lesson order. */
export function flattenLessons(course: Course): Lesson[] {
  return course.modules.flatMap((m) => m.lessons);
}

export function totalLessons(course: Course): number {
  return flattenLessons(course).length;
}

export function completedCount(course: Course, completion: Completion): number {
  return flattenLessons(course).filter((l) => lessonStatus(completion, l.id) === "completed").length;
}

export function inProgressCount(course: Course, completion: Completion): number {
  return flattenLessons(course).filter((l) => lessonStatus(completion, l.id) === "in-progress").length;
}

/** round(100 * (completed + 0.5*inProgress) / total) — in-progress counts as half. */
export function coursePercent(course: Course, completion: Completion): number {
  const total = totalLessons(course);
  if (total === 0) return 0;
  const done = completedCount(course, completion);
  const half = inProgressCount(course, completion);
  return Math.round((100 * (done + 0.5 * half)) / total);
}

export function moduleCounts(
  course: Course,
  moduleId: string,
  completion: Completion,
): { done: number; total: number } {
  const mod = course.modules.find((m) => m.id === moduleId);
  if (!mod) return { done: 0, total: 0 };
  const done = mod.lessons.filter((l) => lessonStatus(completion, l.id) === "completed").length;
  return { done, total: mod.lessons.length };
}

export function isCourseCompleted(course: Course, completion: Completion): boolean {
  return coursePercent(course, completion) >= 100;
}

/**
 * Sequential locking: a lesson is locked if its index is past the first
 * not-completed lesson. The current lesson is never locked.
 */
export function isLessonLocked(
  course: Course,
  lessonId: string,
  completion: Completion,
  currentLessonId: string,
  enabled: boolean,
): boolean {
  if (!enabled) return false;
  if (lessonId === currentLessonId) return false;
  const flat = flattenLessons(course);
  const firstIncomplete = flat.findIndex((l) => lessonStatus(completion, l.id) !== "completed");
  if (firstIncomplete === -1) return false;
  const idx = flat.findIndex((l) => l.id === lessonId);
  return idx > firstIncomplete;
}

export function findLesson(course: Course, lessonId: string): Lesson | undefined {
  return flattenLessons(course).find((l) => l.id === lessonId);
}

export function moduleOfLesson(course: Course, lessonId: string) {
  return course.modules.find((m) => m.lessons.some((l) => l.id === lessonId));
}

export function adjacentLesson(
  course: Course,
  lessonId: string,
  dir: 1 | -1,
): Lesson | undefined {
  const flat = flattenLessons(course);
  const idx = flat.findIndex((l) => l.id === lessonId);
  if (idx === -1) return undefined;
  return flat[idx + dir];
}
