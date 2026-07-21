// Maps the Learn wire types → the presentational view-model.
import type {
  ActivitySettings,
  CourseSummary,
  Course as WireCourse,
  Module as WireModule,
} from "./api/types";
import type { Course, CourseSummaryVM, CoverTone, Lesson, Module } from "./types";

const TONES: CoverTone[] = ["indigo", "slate", "teal", "espresso", "plum", "ink"];

/** Deterministic cover tone from the course id (the flat Course has no tone). */
export function toneOf(id: string): CoverTone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

export function adaptCourseSummary(c: CourseSummary): CourseSummaryVM {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    category: c.category,
    tone: toneOf(c.id),
    lessonCount: c.activityCount,
  };
}

function adaptModule(m: WireModule): Module {
  return {
    id: m.id,
    title: m.title,
    order: m.seq,
    lessons: m.activities
      .filter((a) => (a.settings as ActivitySettings | null)?.published !== false)
      .map((a): Lesson => {
        const s = (a.settings ?? {}) as ActivitySettings;
        return {
          id: a.id,
          title: s.title?.trim() || "Untitled activity",
          order: a.seq,
          content: s.content ?? null,
        };
      }),
  };
}

export function adaptCourse(course: WireCourse, modules: WireModule[]): Course {
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    category: course.category,
    tone: toneOf(course.id),
    modules: modules.map(adaptModule),
  };
}
