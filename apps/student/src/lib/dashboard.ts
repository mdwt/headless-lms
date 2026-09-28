// Courses-page derivation. Pure functions over the server-fetched course list
// and per-course progress, plus the URL vocabulary the toolbar writes into.
import type { Completion, CourseSummaryVM } from "./types";
import { percentOf } from "./progress";

export type CourseState = "in-progress" | "not-started" | "completed" | "expired";
export type FilterValue = "all" | "inprogress" | "completed";
export type SortValue = "recent" | "progress" | "title";
export type LayoutValue = "grid" | "list";

export const FILTERS = ["all", "inprogress", "completed"] as const;
export const SORTS = ["recent", "progress", "title"] as const;
export const LAYOUTS = ["grid", "list"] as const;

export interface DashboardParams {
  filter: FilterValue;
  sort: SortValue;
  layout: LayoutValue;
}

export const DEFAULT_PARAMS: DashboardParams = {
  filter: "all",
  sort: "recent",
  layout: "grid",
};

/** One course as the cards, rows and hero want it. */
export interface CourseView {
  course: CourseSummaryVM;
  percent: number;
  done: number;
  state: CourseState;
}

export type SearchParams = Record<string, string | string[] | undefined>;

function pick<T extends string>(
  allowed: readonly T[],
  raw: string | string[] | undefined,
  fallback: T,
): T {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function parseDashboardParams(sp: SearchParams): DashboardParams {
  return {
    filter: pick(FILTERS, sp.filter, DEFAULT_PARAMS.filter),
    sort: pick(SORTS, sp.sort, DEFAULT_PARAMS.sort),
    layout: pick(LAYOUTS, sp.layout, DEFAULT_PARAMS.layout),
  };
}

/** Link target for a view, omitting defaults so the plain URL stays clean. */
export function dashboardHref(params: DashboardParams): string {
  const query = new URLSearchParams();
  for (const key of ["filter", "sort", "layout"] as const) {
    if (params[key] !== DEFAULT_PARAMS[key]) query.set(key, params[key]);
  }
  const qs = query.toString();
  return qs ? `/?${qs}` : "/";
}

export function toCourseView(course: CourseSummaryVM, completion: Completion): CourseView {
  const statuses = Object.values(completion);
  const done = statuses.filter((s) => s === "completed").length;
  const started = statuses.filter((s) => s === "in-progress").length;
  const percent = percentOf(done, started, course.lessonCount);
  return { course, percent, done, state: stateOf(percent, done, started) };
}

function stateOf(percent: number, done: number, started: number): CourseState {
  if (percent >= 100) return "completed";
  if (done === 0 && started === 0) return "not-started";
  return "in-progress";
}

export function filterCourses(views: CourseView[], filter: FilterValue): CourseView[] {
  if (filter === "inprogress") return views.filter((v) => v.state === "in-progress");
  if (filter === "completed") return views.filter((v) => v.state === "completed");
  return views;
}

/** "recent" is source order — the API already returns most-recent-first. */
export function sortCourses(views: CourseView[], sort: SortValue): CourseView[] {
  if (sort === "progress") return [...views].sort((a, b) => b.percent - a.percent);
  if (sort === "title")
    return [...views].sort((a, b) => a.course.title.localeCompare(b.course.title));
  return views;
}

export function countByState(views: CourseView[]): { inProgress: number; completed: number } {
  return {
    inProgress: views.filter((v) => v.state === "in-progress").length,
    completed: views.filter((v) => v.state === "completed").length,
  };
}

/** The resume hero's subject: the first course already under way. */
export function pickHero(views: CourseView[]): CourseView | undefined {
  return views.find((v) => v.state === "in-progress");
}

export function courseHref(courseId: string): string {
  return `/courses/${courseId}`;
}
