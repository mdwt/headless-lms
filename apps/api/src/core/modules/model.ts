// modules context — course modules and their items (lessons + assessments).
// Framework-free.

export type LessonType = "video" | "text" | "pdf" | "audio" | "download" | "embed";
export type AssessmentType = "quiz" | "assignment";

export interface Lesson {
  readonly id: string;
  moduleId: string;
  kind: "lesson";
  title: string;
  order: number;
  type: LessonType;
  durationLabel?: string;
  /** Media-library asset backing this lesson (video file, downloadable, …). */
  assetId?: string;
  published: boolean;
}

export interface Assessment {
  readonly id: string;
  moduleId: string;
  kind: "assessment";
  title: string;
  order: number;
  type: AssessmentType;
  questionCount?: number;
  pointsPossible?: number;
  published: boolean;
}

export type ModuleItem = Lesson | Assessment;

export interface Module {
  readonly id: string;
  courseId: string;
  title: string;
  order: number;
  items: ModuleItem[];
}

export type SaveItemInput =
  | {
      kind: "lesson";
      title: string;
      type: LessonType;
      durationLabel?: string;
      assetId?: string;
      published?: boolean;
    }
  | {
      kind: "assessment";
      title: string;
      type: AssessmentType;
      questionCount?: number;
      pointsPossible?: number;
      published?: boolean;
    };
