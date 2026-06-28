/**
 * Deterministic in-memory seed data for the mock backend.
 *
 * No randomness at import time (keeps SSR/CSR output stable). The mock server
 * (`mock-server.ts`) mutates copies of these arrays to simulate writes.
 */

import type {
  Assessment,
  Course,
  Enrollment,
  Lesson,
  Member,
  Module,
  Organization,
  SessionUser,
  Student,
  Submission,
} from "./types";

export const ORG: Organization = {
  id: "org_atelier",
  name: "Atelier Academy",
  slug: "atelier",
};

/** The signed-in user. Swap `role` to preview the role-aware UI. */
export const CURRENT_USER: SessionUser = {
  id: "usr_owner",
  name: "Mira Okonkwo",
  email: "mira@atelier.academy",
  image: null,
  role: "owner",
  scopedCourseIds: [],
};

const FIRST = [
  "Mira", "Theo", "Priya", "Daniel", "Lena", "Marco", "Aisha", "Noah", "Sofia",
  "Ezra", "Yuki", "Omar", "Hana", "Liam", "Greta", "Ravi", "Nora", "Felix",
  "Iris", "Kojo", "Mei", "Anders", "Zara", "Pablo", "Tove", "Idris", "Clara",
  "Bashir", "Wren", "Otto", "Selin", "Dario", "Maya", "Quentin", "Eve", "Hugo",
];
const LAST = [
  "Okonkwo", "Lindqvist", "Nair", "Mercer", "Halvorsen", "Bianchi", "Rahman",
  "Whitlock", "Castellano", "Adler", "Tanaka", "Haddad", "Kim", "Brennan",
  "Sørensen", "Patel", "Devlin", "Auer", "Lowell", "Mensah", "Zhao", "Holt",
  "Farouk", "Reyes", "Berg", "Okafor", "Voss", "Said", "Calloway", "Marchetti",
];

const CATEGORIES = [
  "Design", "Engineering", "Product", "Marketing", "Data", "Leadership",
  "Finance", "Operations",
];

const COURSE_TITLES = [
  "Foundations of Type & Layout",
  "Designing Accessible Interfaces",
  "Systems Thinking for Product Teams",
  "Practical Color Theory",
  "Modern CSS Architecture",
  "Editorial Design in Practice",
  "Motion Design Fundamentals",
  "Research Methods for Designers",
  "Pricing Strategy Essentials",
  "Brand Identity from Scratch",
  "Data Visualization Craft",
  "Writing for Interfaces",
  "Design Operations 101",
  "Advanced Prototyping",
  "Service Design Workshop",
  "The Art of Critique",
  "Frontend Performance Deep Dive",
  "Information Architecture",
  "Design Leadership Track",
  "User Onboarding Patterns",
  "Conversion Copywriting",
  "Financial Modeling Basics",
  "Operations at Scale",
  "Storytelling with Data",
  "Component API Design",
  "Designing for Trust",
  "Inclusive Research Practices",
  "Roadmapping & Prioritization",
  "Design Tokens in Depth",
  "Marketing Analytics Primer",
  "Negotiation for Managers",
  "Async Team Communication",
  "Portfolio Studio",
  "Illustration for Product",
  "Sound & Voice Interfaces",
  "Ethics in Design",
  "Growth Experiment Design",
  "Workshop Facilitation",
  "Design Systems Governance",
  "Customer Interview Mastery",
];

function name(i: number): string {
  return `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + 3) % LAST.length]}`;
}
function email(n: string, i: number): string {
  const handle = n.toLowerCase().replace(/[^a-z]+/g, ".");
  return `${handle}${i % 3 === 0 ? "" : i}@example.com`;
}
/** Stable pseudo-date offset (days back from the fixed "now"). */
export const NOW = new Date("2026-06-28T12:00:00.000Z").getTime();
const DAY = 86_400_000;
function daysAgo(n: number): string {
  return new Date(NOW - n * DAY).toISOString();
}
function daysAhead(n: number): string {
  return new Date(NOW + n * DAY).toISOString();
}

// --- Instructors (subset of members) -------------------------------------
export const INSTRUCTORS = Array.from({ length: 6 }, (_, i) => ({
  id: `usr_inst_${i + 1}`,
  name: name(i + 2),
}));

// --- Courses ---------------------------------------------------------------
export const COURSES: Course[] = COURSE_TITLES.map((title, i) => {
  const instructor = INSTRUCTORS[i % INSTRUCTORS.length];
  const moduleCount = 3 + (i % 4);
  const lessonCount = moduleCount * (3 + (i % 3));
  return {
    id: `crs_${(i + 1).toString().padStart(3, "0")}`,
    title,
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    description:
      "A focused, project-based course covering the essentials and the advanced edges of the craft.",
    status: i % 5 === 0 ? "draft" : "published",
    category: CATEGORIES[i % CATEGORIES.length],
    instructorId: instructor.id,
    instructorName: instructor.name,
    moduleCount,
    lessonCount,
    enrolledCount: ((i * 37) % 240) + (i % 5 === 0 ? 0 : 12),
    updatedAt: daysAgo((i * 3) % 90),
    createdAt: daysAgo(120 + i * 4),
  };
});

// --- Modules + items for a single course (built on demand) -----------------
const LESSON_TYPES: Lesson["type"][] = ["video", "text", "pdf", "audio", "download", "embed"];

export function buildModules(courseId: string): Module[] {
  const seed = courseId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const moduleCount = 3 + (seed % 3);
  return Array.from({ length: moduleCount }, (_, m) => {
    const itemCount = 3 + ((seed + m) % 3);
    const items = Array.from({ length: itemCount }, (_, n): Lesson | Assessment => {
      const isAssessment = (seed + m + n) % 4 === 3;
      if (isAssessment) {
        const isAssignment = (seed + n) % 2 === 0;
        return {
          id: `itm_${courseId}_${m}_${n}`,
          moduleId: `mod_${courseId}_${m}`,
          kind: "assessment",
          title: isAssignment ? `Assignment ${m + 1}.${n + 1}` : `Quiz ${m + 1}.${n + 1}`,
          order: n,
          type: isAssignment ? "assignment" : "quiz",
          questionCount: isAssignment ? undefined : 5 + (n % 6),
          pointsPossible: isAssignment ? 100 : 50,
          published: (seed + m + n) % 6 !== 0,
        };
      }
      const type = LESSON_TYPES[(seed + m + n) % LESSON_TYPES.length];
      const mins = 4 + ((seed + n * 3) % 22);
      return {
        id: `itm_${courseId}_${m}_${n}`,
        moduleId: `mod_${courseId}_${m}`,
        kind: "lesson",
        title:
          [
            "Introduction & setup",
            "Core principles",
            "Working through an example",
            "Common pitfalls",
            "Hands-on exercise",
            "Going further",
          ][(m + n) % 6],
        order: n,
        type,
        durationLabel:
          type === "download" || type === "embed" ? undefined : `${mins} min`,
        published: (seed + m + n) % 7 !== 0,
      };
    });
    return {
      id: `mod_${courseId}_${m}`,
      courseId,
      title: ["Getting started", "Fundamentals", "In practice", "Advanced", "Capstone"][m % 5],
      order: m,
      items,
    };
  });
}

// --- Students --------------------------------------------------------------
export const STUDENTS: Student[] = Array.from({ length: 124 }, (_, i) => {
  const n = name(i * 3 + 5);
  return {
    id: `std_${(i + 1).toString().padStart(3, "0")}`,
    name: n,
    email: email(n, i),
    image: null,
    enrollmentCount: 1 + (i % 5),
    avgProgress: (i * 13) % 101,
    joinedAt: daysAgo((i * 5) % 300),
    lastActiveAt: i % 9 === 0 ? null : daysAgo(i % 40),
  };
});

// --- Enrollments -----------------------------------------------------------
const ENROLL_STATUS: Enrollment["status"][] = ["active", "active", "active", "expired", "revoked"];
const SOURCES: Enrollment["source"][] = ["manual", "purchase", "import"];

export const ENROLLMENTS: Enrollment[] = Array.from({ length: 268 }, (_, i) => {
  const student = STUDENTS[i % STUDENTS.length];
  const course = COURSES[(i * 11) % COURSES.length];
  const status = ENROLL_STATUS[i % ENROLL_STATUS.length];
  const expiresOffset = (i * 7) % 120;
  return {
    id: `enr_${(i + 1).toString().padStart(4, "0")}`,
    studentId: student.id,
    studentName: student.name,
    studentEmail: student.email,
    courseId: course.id,
    courseTitle: course.title,
    status,
    progressPercent: status === "revoked" ? (i * 3) % 60 : (i * 17) % 101,
    grantedAt: daysAgo(30 + (i % 200)),
    expiresAt:
      i % 4 === 0
        ? null
        : status === "expired"
          ? daysAgo(expiresOffset % 30)
          : daysAhead(expiresOffset),
    source: SOURCES[i % SOURCES.length],
  };
});

// --- Submissions (grading queue) ------------------------------------------
const SUB_STATUS: Submission["status"][] = ["pending", "pending", "pending", "graded", "returned"];

export const SUBMISSIONS: Submission[] = Array.from({ length: 46 }, (_, i) => {
  const student = STUDENTS[(i * 5) % STUDENTS.length];
  const course = COURSES[(i * 3) % COURSES.length];
  const status = SUB_STATUS[i % SUB_STATUS.length];
  const points = 100;
  return {
    id: `sub_${(i + 1).toString().padStart(3, "0")}`,
    assessmentId: `itm_${course.id}_assign_${i}`,
    assessmentTitle: `Assignment ${(i % 4) + 1}.${(i % 3) + 1}`,
    courseId: course.id,
    courseTitle: course.title,
    studentId: student.id,
    studentName: student.name,
    studentEmail: student.email,
    status,
    submittedAt: daysAgo(i % 18),
    pointsPossible: points,
    score: status === "pending" ? null : 60 + ((i * 7) % 40),
    feedback: status === "pending" ? null : "Solid work — tighten the spacing rhythm in section two.",
    responsePreview:
      "For this exercise I started from the type scale and worked outward to the grid. The hardest part was reconciling the column gaps with the baseline…",
  };
});

// --- Team members ----------------------------------------------------------
export const MEMBERS: Member[] = [
  {
    id: CURRENT_USER.id,
    name: CURRENT_USER.name,
    email: CURRENT_USER.email,
    image: null,
    role: "owner",
    status: "active",
    joinedAt: daysAgo(420),
    invitedAt: null,
  },
  ...INSTRUCTORS.map((inst, i) => ({
    id: inst.id,
    name: inst.name,
    email: email(inst.name, i + 1),
    image: null,
    role: (i === 0 ? "admin" : "instructor") as Member["role"],
    status: "active" as const,
    joinedAt: daysAgo(200 - i * 20),
    invitedAt: null,
  })),
  {
    id: "usr_invited_1",
    name: "Pending invite",
    email: "new.lead@example.com",
    image: null,
    role: "admin",
    status: "invited",
    joinedAt: null,
    invitedAt: daysAgo(2),
  },
  {
    id: "usr_invited_2",
    name: "Pending invite",
    email: "guest.instructor@example.com",
    image: null,
    role: "instructor",
    status: "invited",
    joinedAt: null,
    invitedAt: daysAgo(6),
  },
];
