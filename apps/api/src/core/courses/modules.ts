// courses context — curriculum structure under a course. Framework-free.
//
// Aggregate shape (mirrors the frozen schema):
//   Course → Module → ordered ModuleItem links → each link resolves to ONE
//   Lesson OR ONE Assessment. `Lesson` and `Assessment` are the content
//   entities; `ModuleItem` is a thin orderable LINK that places one of them in a
//   module at a `seq`. Lesson media is a many-to-many via lesson_assets,
//   surfaced here as `Lesson.assetIds`.

export type LessonType = "video" | "text" | "pdf" | "audio" | "download" | "embed";
export type AssessmentType = "quiz" | "assignment";

/** Content entity: a lesson. `settings` is an opaque per-lesson blob. */
export interface Lesson {
  readonly id: string;
  type: LessonType;
  title: string;
  /** Opaque per-lesson blob (content + completion rule + misc). Not modelled. */
  settings: unknown;
  /** Media-library assets backing this lesson (lesson_assets), ordered. */
  assetIds: string[];
}

/** Content entity: an assessment. */
export interface Assessment {
  readonly id: string;
  type: AssessmentType;
  title: string;
  questionCount?: number;
  pointsPossible?: number;
  published: boolean;
}

/**
 * Orderable LINK: places one Lesson OR one Assessment in a module at `seq`.
 * The resolved content entity is embedded for the editor's tree render.
 */
export type ModuleItem =
  | {
      readonly id: string;
      moduleId: string;
      seq: number;
      kind: "lesson";
      lessonId: string;
      lesson: Lesson;
    }
  | {
      readonly id: string;
      moduleId: string;
      seq: number;
      kind: "assessment";
      assessmentId: string;
      assessment: Assessment;
    };

export interface Module {
  readonly id: string;
  courseId: string;
  title: string;
  seq: number;
  items: ModuleItem[];
}

/**
 * Upsert payload for a module item. Creates/updates the underlying Lesson or
 * Assessment AND its module_items link row.
 */
export type SaveItemInput =
  | {
      kind: "lesson";
      title: string;
      type: LessonType;
      settings?: unknown;
      assetIds?: string[];
    }
  | {
      kind: "assessment";
      title: string;
      type: AssessmentType;
      questionCount?: number;
      pointsPossible?: number;
      published?: boolean;
    };
