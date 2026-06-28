// Data model — mirrors the eventual API shapes (handoff "Data model").
// Components are presentational and driven by these; real wiring is a hook swap.

export type LessonType = "video" | "text" | "quiz" | "pdf" | "audio" | "download";
export type LessonStatus = "not-started" | "in-progress" | "completed";
export type EnrollmentStatus = "active" | "expired";
export type CoverTone = "indigo" | "slate" | "teal" | "espresso" | "plum" | "ink";

export interface Student {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  initials: string;
}

export interface Enrollment {
  courseId: string;
  status: EnrollmentStatus;
  progressPercent: number; // server-provided hint; UI recomputes from completion
  lastAccessedLessonId: string | null;
  expiresAt?: string;
}

export interface QuizOption {
  id: string;
  label: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
  correctOptionId: string;
}

export interface LessonContent {
  // video / audio
  durationLabel?: string;
  // text
  lede?: string;
  body?: string[];
  pullQuote?: string;
  tail?: string[];
  // quiz
  questions?: QuizQuestion[];
  // pdf
  fileName?: string;
  pageCount?: number;
  // download
  fileMeta?: string; // "ZIP · 24 MB · 12 files"
  // overview (video/audio)
  description?: string;
  resources?: { id: string; label: string }[];
}

export interface Lesson {
  id: string;
  title: string;
  order: number;
  type: LessonType;
  durationSeconds: number;
  content: LessonContent;
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
  thumbnail?: string;
  instructor: string;
  category: string;
  tone: CoverTone;
  modules: Module[];
}

export type Completion = Record<string, LessonStatus>;
