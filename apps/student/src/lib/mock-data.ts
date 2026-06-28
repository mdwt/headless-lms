// Demo dataset matching the handoff prototype. Swap each read for a real hook.
import type { Completion, Course, Enrollment, Student } from "./types";

export const student: Student = {
  id: "stu_1",
  name: "Mara Vance",
  email: "mara@example.com",
  initials: "MV",
};

// secs helpers
const m = (min: number, sec = 0) => min * 60 + sec;

const artOfSeeing: Course = {
  id: "art-of-seeing",
  title: "The Art of Seeing",
  description:
    "A photography course about attention — learning to notice light, structure, and the quiet geometry of everyday scenes.",
  instructor: "Iris Calder",
  category: "Photography",
  tone: "indigo",
  modules: [
    {
      id: "m1",
      title: "Foundations",
      order: 1,
      lessons: [
        {
          id: "l1",
          title: "Why we look",
          order: 1,
          type: "video",
          durationSeconds: m(7, 20),
          content: {
            description:
              "What attention is, and why a photograph begins long before the shutter.",
            resources: [{ id: "r1", label: "Lecture slides" }],
          },
        },
        {
          id: "l2",
          title: "Seeing vs. looking",
          order: 2,
          type: "text",
          durationSeconds: m(5),
          content: {
            lede: "Looking is automatic. Seeing is a decision — a small act of refusal against the blur of the familiar.",
            body: [
              "We move through most days without seeing much of anything. The mind, efficient to a fault, replaces the world with its expectations: a door is a door, a street is a street, a face is a name. This is useful for survival and catastrophic for photography.",
              "To see is to suspend that efficiency on purpose. You let the door become a rectangle of shadow, the street become a set of converging lines, the face become a topography of light. Nothing is named until it has first been looked at.",
            ],
            pullQuote:
              "The camera cannot see for you. It can only record the seeing you have already done.",
            tail: [
              "Practice this without a camera first. Spend five minutes describing what is actually in front of you — not what you know to be there, but what the light is doing right now.",
            ],
          },
        },
        {
          id: "l3",
          title: "The camera as eye",
          order: 3,
          type: "video",
          durationSeconds: m(11, 5),
          content: { description: "How the lens both extends and distorts human vision." },
        },
        {
          id: "l4",
          title: "Checkpoint: Foundations",
          order: 4,
          type: "quiz",
          durationSeconds: m(3),
          content: {
            questions: [
              {
                id: "q1",
                prompt: "What distinguishes seeing from looking?",
                options: [
                  { id: "a", label: "Seeing is faster and more automatic." },
                  { id: "b", label: "Seeing is a deliberate suspension of expectation." },
                  { id: "c", label: "Seeing requires a more expensive camera." },
                ],
                correctOptionId: "b",
              },
              {
                id: "q2",
                prompt: "A photograph begins…",
                options: [
                  { id: "a", label: "When the shutter fires." },
                  { id: "b", label: "In editing." },
                  { id: "c", label: "Before the shutter, in the act of attention." },
                ],
                correctOptionId: "c",
              },
            ],
          },
        },
      ],
    },
    {
      id: "m2",
      title: "Composition",
      order: 2,
      lessons: [
        {
          id: "l5",
          title: "The frame within the frame",
          order: 1,
          type: "video",
          durationSeconds: m(9, 45),
          content: {
            description:
              "In this lesson we look at how a frame can hold a second frame inside it — a doorway, a window, a shaft of light — and how that structure quietly directs the eye toward what matters.",
            resources: [
              { id: "r1", label: "Lesson notes (PDF)" },
              { id: "r2", label: "Example set" },
            ],
          },
        },
        {
          id: "l6",
          title: "Balance & tension",
          order: 2,
          type: "text",
          durationSeconds: m(6),
          content: {
            lede: "A balanced frame is restful. A tense one is alive. Most good photographs choose tension and then control it.",
            body: [
              "Balance is the easy part. Center the subject, level the horizon, and the eye settles. The trouble is that a settled eye stops searching, and a photograph that asks nothing of the viewer is quickly forgotten.",
              "Tension is what you introduce when you push the subject to an edge, let a diagonal cut across the calm, or leave a deliberate emptiness where the eye expected mass. The frame leans. The viewer leans with it.",
            ],
            pullQuote: "Compose like a tightrope walker: the point is not to fall, but you must look like you might.",
            tail: [
              "The craft is in the recovery — a counterweight somewhere in the frame that answers the tension without resolving it completely. A shadow against the bright subject. A small dark anchor in the corner.",
              "Shoot the same scene twice: once balanced, once tense. Compare them an hour later and notice which one you keep returning to.",
            ],
          },
        },
        {
          id: "l7",
          title: "Worksheet: Composition studies",
          order: 3,
          type: "pdf",
          durationSeconds: m(0),
          content: { fileName: "composition-studies.pdf", pageCount: 6 },
        },
        {
          id: "l8",
          title: "Field recording: a walk in the city",
          order: 4,
          type: "audio",
          durationSeconds: m(14),
          content: {
            description:
              "A narrated walk — thinking aloud about frames, edges, and timing while moving through a busy street.",
            resources: [{ id: "r1", label: "Transcript" }],
          },
        },
      ],
    },
    {
      id: "m3",
      title: "Light & Shadow",
      order: 3,
      lessons: [
        {
          id: "l9",
          title: "Quality of light",
          order: 1,
          type: "video",
          durationSeconds: m(12, 30),
          content: { description: "Hard vs. soft, direction, and the times of day that reward patience." },
        },
        {
          id: "l10",
          title: "Reading shadow",
          order: 2,
          type: "text",
          durationSeconds: m(7),
          content: {
            lede: "Shadow is not the absence of the subject. It is half of it.",
            body: [
              "Beginners expose for the light and let the shadows fall where they may. The shadow, though, is doing structural work: it gives the light an edge, the subject a volume, the frame a weight on one side.",
            ],
            tail: ["Look for the shadow first. Compose for it. The light will take care of itself."],
          },
        },
        {
          id: "l11",
          title: "Reference pack",
          order: 3,
          type: "download",
          durationSeconds: m(0),
          content: { fileName: "light-reference-pack.zip", fileMeta: "ZIP · 24 MB · 12 files" },
        },
      ],
    },
    {
      id: "m4",
      title: "The Edit",
      order: 4,
      lessons: [
        {
          id: "l12",
          title: "Sequencing a set",
          order: 1,
          type: "video",
          durationSeconds: m(10, 15),
          content: { description: "Turning a folder of frames into a sequence that holds together." },
        },
        {
          id: "l13",
          title: "Final checkpoint",
          order: 2,
          type: "quiz",
          durationSeconds: m(4),
          content: {
            questions: [
              {
                id: "q1",
                prompt: "A tense composition is one that…",
                options: [
                  { id: "a", label: "Centers the subject and levels the horizon." },
                  { id: "b", label: "Leans the frame and answers it with a counterweight." },
                  { id: "c", label: "Avoids shadow entirely." },
                ],
                correctOptionId: "b",
              },
            ],
          },
        },
      ],
    },
  ],
};

// Lighter courses — enough to render the dashboard + open a simple player.
const simpleModules = (prefix: string, titles: [string, "video" | "text" | "quiz"][][]) =>
  titles.map((lessons, mi) => ({
    id: `${prefix}-m${mi + 1}`,
    title: `Module ${mi + 1}`,
    order: mi + 1,
    lessons: lessons.map(([title, type], li) => ({
      id: `${prefix}-l${mi + 1}-${li + 1}`,
      title,
      order: li + 1,
      type,
      durationSeconds: m(8, 0),
      content:
        type === "text"
          ? { lede: "A short reading.", body: ["Placeholder body copy for this lesson."] }
          : type === "quiz"
            ? {
                questions: [
                  {
                    id: "q1",
                    prompt: "Sample question?",
                    options: [
                      { id: "a", label: "Option A" },
                      { id: "b", label: "Option B" },
                    ],
                    correctOptionId: "a",
                  },
                ],
              }
            : { description: "A short video lesson." },
    })),
  }));

const typography: Course = {
  id: "typography-layout",
  title: "Typography & Layout",
  description: "Setting type with intention — rhythm, measure, and the grid.",
  instructor: "Jonas Reed",
  category: "Design",
  tone: "slate",
  modules: simpleModules("typo", [
    [["Anatomy of type", "video"], ["The measure", "text"]],
    [["Building a scale", "video"], ["Grids", "video"], ["Checkpoint", "quiz"]],
  ]),
};

const colorForScreen: Course = {
  id: "color-for-screen",
  title: "Color for Screen",
  description: "Color systems that survive contact with real interfaces.",
  instructor: "Lena Ortiz",
  category: "Design",
  tone: "teal",
  modules: simpleModules("color", [
    [["Hue, value, chroma", "video"], ["Contrast", "text"]],
    [["Palettes", "video"], ["Checkpoint", "quiz"]],
  ]),
};

const motion: Course = {
  id: "motion-principles",
  title: "Motion Principles",
  description: "Timing, easing, and choreography for interface motion.",
  instructor: "Devi Rao",
  category: "Motion",
  tone: "plum",
  modules: simpleModules("motion", [[["Easing", "video"], ["Timing", "text"]]]),
};

const brandSystems: Course = {
  id: "brand-systems",
  title: "Brand Systems",
  description: "Designing identities that scale across surfaces.",
  instructor: "Omar Haddad",
  category: "Branding",
  tone: "espresso",
  modules: simpleModules("brand", [[["Marks", "video"], ["Voice", "text"]]]),
};

const soundDesign: Course = {
  id: "sound-design",
  title: "Sound Design",
  description: "Texture, space, and restraint in interface sound.",
  instructor: "Pia Lindqvist",
  category: "Audio",
  tone: "ink",
  modules: simpleModules("sound", [[["Foley basics", "video"], ["Mixing", "video"]]]),
};

export const courses: Course[] = [
  artOfSeeing,
  typography,
  colorForScreen,
  motion,
  brandSystems,
  soundDesign,
];

export function getCourse(courseId: string): Course | undefined {
  return courses.find((c) => c.id === courseId);
}

export const enrollments: Enrollment[] = [
  { courseId: "art-of-seeing", status: "active", progressPercent: 35, lastAccessedLessonId: "l5" },
  { courseId: "typography-layout", status: "active", progressPercent: 62, lastAccessedLessonId: "typo-l2-1" },
  { courseId: "color-for-screen", status: "active", progressPercent: 100, lastAccessedLessonId: "color-l2-2" },
  {
    courseId: "motion-principles",
    status: "expired",
    progressPercent: 48,
    lastAccessedLessonId: "motion-l1-1",
    expiresAt: "2026-05-30",
  },
  { courseId: "brand-systems", status: "active", progressPercent: 0, lastAccessedLessonId: null },
  { courseId: "sound-design", status: "active", progressPercent: 20, lastAccessedLessonId: "sound-l1-1" },
];

export function getEnrollment(courseId: string): Enrollment | undefined {
  return enrollments.find((e) => e.courseId === courseId);
}

// Per-student completion seed (the source of all progress math).
// Art of Seeing: Foundations done (l1-l4), current l5 in-progress -> 35%.
export const initialCompletion: Record<string, Completion> = {
  "art-of-seeing": {
    l1: "completed",
    l2: "completed",
    l3: "completed",
    l4: "completed",
    l5: "in-progress",
  },
  "typography-layout": {
    "typo-l1-1": "completed",
    "typo-l1-2": "completed",
    "typo-l2-1": "in-progress",
  },
  "color-for-screen": {
    "color-l1-1": "completed",
    "color-l1-2": "completed",
    "color-l2-1": "completed",
    "color-l2-2": "completed",
  },
  "motion-principles": { "motion-l1-1": "completed" },
  "brand-systems": {},
  "sound-design": { "sound-l1-1": "in-progress" },
};

export const monthlyHoursLabel = "18h";
