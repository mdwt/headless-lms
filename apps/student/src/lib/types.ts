// View-model the presentational components are driven by. Adapted from the
// Learn wire types in `adapt.ts`.
import type { ActivityContent } from "./api/types";

export type LessonStatus = "not-started" | "in-progress" | "completed";
export type CoverTone = "indigo" | "slate" | "teal" | "espresso" | "plum" | "ink";

export interface Lesson {
  id: string;
  title: string;
  order: number;
  /** The activity's `settings.content` Plate value, or null when unset. */
  content: ActivityContent | null;
}

export interface Module {
  id: string;
  title: string;
  order: number;
  lessons: Lesson[];
}

export interface Course {
  id: string;
  title: string;
  description: string;
  category: string;
  tone: CoverTone;
  modules: Module[];
}

/** Dashboard card shape — the course list omits modules; `lessonCount` is the
 *  wire activity count, the denominator for local-completion progress. */
export type CourseSummaryVM = Omit<Course, "modules"> & { lessonCount: number };

export type Completion = Record<string, LessonStatus>;
