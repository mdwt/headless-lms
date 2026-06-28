/**
 * In-memory mock backend. Implements server-side pagination, multi-column
 * sort, global search, and faceted filtering so the data tables behave exactly
 * as they will against the real API. State is mutated in module scope to
 * simulate persistence within a session.
 */

import { ApiError } from "./http";
import {
  COURSES,
  ENROLLMENTS,
  MEMBERS,
  STUDENTS,
  SUBMISSIONS,
  buildModules,
  NOW,
} from "./mock-data";
import type {
  Assessment,
  Course,
  Enrollment,
  Lesson,
  ListParams,
  Member,
  Module,
  ModuleItem,
  OverviewStats,
  Paginated,
  Role,
  Student,
  Submission,
} from "./types";

// Mutable copies — the "database".
const db = {
  courses: [...COURSES],
  students: [...STUDENTS],
  enrollments: [...ENROLLMENTS],
  submissions: [...SUBMISSIONS],
  members: [...MEMBERS],
  modules: new Map<string, Module[]>(),
};

function getModules(courseId: string): Module[] {
  if (!db.modules.has(courseId)) db.modules.set(courseId, buildModules(courseId));
  return db.modules.get(courseId)!;
}

// --- generic list engine ---------------------------------------------------

function applyList<T extends object>(
  source: T[],
  params: ListParams,
  opts: {
    searchKeys: (keyof T)[];
    filterAccessors?: Record<string, (row: T) => string>;
  },
): Paginated<T> {
  let rows = [...source];
  const field = (row: T, key: string) => (row as Record<string, unknown>)[key];

  // global search
  const q = params.search?.trim().toLowerCase();
  if (q) {
    rows = rows.filter((row) =>
      opts.searchKeys.some((k) => String(field(row, k as string) ?? "").toLowerCase().includes(q)),
    );
  }

  // faceted filters
  if (params.filters) {
    for (const [col, values] of Object.entries(params.filters)) {
      if (!values?.length) continue;
      const accessor = opts.filterAccessors?.[col] ?? ((row: T) => String(field(row, col) ?? ""));
      rows = rows.filter((row) => values.includes(accessor(row)));
    }
  }

  const total = rows.length;

  // multi-column sort
  if (params.sort?.length) {
    rows.sort((a, b) => {
      for (const s of params.sort!) {
        const av = field(a, s.id);
        const bv = field(b, s.id);
        let cmp = 0;
        if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
        else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
        if (cmp !== 0) return s.desc ? -cmp : cmp;
      }
      return 0;
    });
  }

  // pagination
  const start = (params.page - 1) * params.pageSize;
  return {
    rows: rows.slice(start, start + params.pageSize),
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
}

function nextId(prefix: string): string {
  return `${prefix}_${(Date.now() % 1_000_000).toString(36)}`;
}

// --- courses ---------------------------------------------------------------

export const mockServer = {
  overview(): OverviewStats {
    const published = db.courses.filter((c) => c.status === "published").length;
    const soon = db.enrollments.filter(
      (e) =>
        e.status === "active" &&
        e.expiresAt &&
        new Date(e.expiresAt).getTime() - NOW < 14 * 86_400_000,
    ).length;
    return {
      publishedCourses: published,
      draftCourses: db.courses.length - published,
      activeStudents: db.students.filter((s) => s.lastActiveAt).length,
      activeEnrollments: db.enrollments.filter((e) => e.status === "active").length,
      pendingSubmissions: db.submissions.filter((s) => s.status === "pending").length,
      expiringSoon: soon,
    };
  },

  listCourses(params: ListParams, scope: Role, scopedIds: string[]): Paginated<Course> {
    let source = db.courses;
    if (scope === "instructor") source = source.filter((c) => scopedIds.includes(c.id));
    return applyList(source, params, {
      searchKeys: ["title", "instructorName", "category"],
      filterAccessors: { status: (r) => r.status, category: (r) => r.category },
    });
  },

  getCourse(id: string): Course {
    const c = db.courses.find((x) => x.id === id);
    if (!c) throw new ApiError(404, "Course not found");
    return c;
  },

  createCourse(input: Partial<Course>): Course {
    const id = nextId("crs");
    const course: Course = {
      id,
      title: input.title ?? "Untitled course",
      slug: (input.title ?? "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      description: input.description ?? "",
      status: "draft",
      category: input.category ?? "Design",
      instructorId: input.instructorId ?? "usr_inst_1",
      instructorName: input.instructorName ?? "Unassigned",
      moduleCount: 0,
      lessonCount: 0,
      enrolledCount: 0,
      updatedAt: new Date(NOW).toISOString(),
      createdAt: new Date(NOW).toISOString(),
    };
    db.courses = [course, ...db.courses];
    db.modules.set(id, []);
    return course;
  },

  updateCourse(id: string, patch: Partial<Course>): Course {
    const i = db.courses.findIndex((c) => c.id === id);
    if (i === -1) throw new ApiError(404, "Course not found");
    db.courses[i] = { ...db.courses[i], ...patch, updatedAt: new Date(NOW).toISOString() };
    return db.courses[i];
  },

  deleteCourse(id: string): void {
    db.courses = db.courses.filter((c) => c.id !== id);
    db.modules.delete(id);
  },

  // --- modules + items ---
  listModules(courseId: string): Module[] {
    return getModules(courseId).map((m) => ({ ...m, items: [...m.items] }));
  },

  reorderModules(courseId: string, orderedIds: string[]): Module[] {
    const mods = getModules(courseId);
    mods.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
    mods.forEach((m, i) => (m.order = i));
    return this.listModules(courseId);
  },

  reorderItems(courseId: string, moduleId: string, orderedIds: string[]): Module[] {
    const mod = getModules(courseId).find((m) => m.id === moduleId);
    if (mod) {
      mod.items.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
      mod.items.forEach((it, i) => (it.order = i));
    }
    return this.listModules(courseId);
  },

  createModule(courseId: string, title: string): Module[] {
    const mods = getModules(courseId);
    mods.push({ id: nextId("mod"), courseId, title, order: mods.length, items: [] });
    return this.listModules(courseId);
  },

  updateModule(courseId: string, moduleId: string, title: string): Module[] {
    const mod = getModules(courseId).find((m) => m.id === moduleId);
    if (mod) mod.title = title;
    return this.listModules(courseId);
  },

  deleteModule(courseId: string, moduleId: string): Module[] {
    db.modules.set(courseId, getModules(courseId).filter((m) => m.id !== moduleId));
    return this.listModules(courseId);
  },

  saveItem(courseId: string, moduleId: string, item: Partial<ModuleItem> & { id?: string }): Module[] {
    const mod = getModules(courseId).find((m) => m.id === moduleId);
    if (!mod) throw new ApiError(404, "Module not found");
    if (item.id) {
      const i = mod.items.findIndex((it) => it.id === item.id);
      if (i !== -1) mod.items[i] = { ...mod.items[i], ...item } as ModuleItem;
    } else {
      const base = {
        id: nextId("itm"),
        moduleId,
        order: mod.items.length,
        published: false,
      };
      const created =
        item.kind === "assessment"
          ? ({ ...base, kind: "assessment", title: item.title ?? "New assessment", type: (item as Assessment).type ?? "quiz", ...item } as Assessment)
          : ({ ...base, kind: "lesson", title: item.title ?? "New lesson", type: (item as Lesson).type ?? "video", ...item } as Lesson);
      mod.items.push(created);
    }
    return this.listModules(courseId);
  },

  deleteItem(courseId: string, moduleId: string, itemId: string): Module[] {
    const mod = getModules(courseId).find((m) => m.id === moduleId);
    if (mod) mod.items = mod.items.filter((it) => it.id !== itemId);
    return this.listModules(courseId);
  },

  // --- students ---
  listStudents(params: ListParams): Paginated<Student> {
    return applyList(db.students, params, { searchKeys: ["name", "email"] });
  },
  getStudent(id: string): Student {
    const s = db.students.find((x) => x.id === id);
    if (!s) throw new ApiError(404, "Student not found");
    return s;
  },
  studentEnrollments(studentId: string): Enrollment[] {
    return db.enrollments.filter((e) => e.studentId === studentId);
  },

  // --- enrollments ---
  listEnrollments(params: ListParams): Paginated<Enrollment> {
    return applyList(db.enrollments, params, {
      searchKeys: ["studentName", "studentEmail", "courseTitle"],
      filterAccessors: { status: (r) => r.status, source: (r) => r.source },
    });
  },
  grantEnrollment(input: { studentId: string; courseId: string; expiresAt: string | null }): Enrollment {
    const student = db.students.find((s) => s.id === input.studentId);
    const course = db.courses.find((c) => c.id === input.courseId);
    if (!student || !course) throw new ApiError(422, "Unknown student or course");
    const e: Enrollment = {
      id: nextId("enr"),
      studentId: student.id,
      studentName: student.name,
      studentEmail: student.email,
      courseId: course.id,
      courseTitle: course.title,
      status: "active",
      progressPercent: 0,
      grantedAt: new Date(NOW).toISOString(),
      expiresAt: input.expiresAt,
      source: "manual",
    };
    db.enrollments = [e, ...db.enrollments];
    return e;
  },
  revokeEnrollment(id: string): Enrollment {
    const e = db.enrollments.find((x) => x.id === id);
    if (!e) throw new ApiError(404, "Enrollment not found");
    e.status = "revoked";
    return e;
  },
  reinstateEnrollment(id: string): Enrollment {
    const e = db.enrollments.find((x) => x.id === id);
    if (!e) throw new ApiError(404, "Enrollment not found");
    e.status = "active";
    return e;
  },

  // --- submissions / grading ---
  listSubmissions(params: ListParams): Paginated<Submission> {
    return applyList(db.submissions, params, {
      searchKeys: ["studentName", "assessmentTitle", "courseTitle"],
      filterAccessors: { status: (r) => r.status, courseTitle: (r) => r.courseTitle },
    });
  },
  gradeSubmission(id: string, input: { score: number; feedback: string }): Submission {
    const s = db.submissions.find((x) => x.id === id);
    if (!s) throw new ApiError(404, "Submission not found");
    s.score = input.score;
    s.feedback = input.feedback;
    s.status = "graded";
    return s;
  },

  // --- members / team ---
  listMembers(params: ListParams): Paginated<Member> {
    return applyList(db.members, params, {
      searchKeys: ["name", "email"],
      filterAccessors: { role: (r) => r.role, status: (r) => r.status },
    });
  },
  inviteMember(input: { email: string; role: Role }): Member {
    if (db.members.some((m) => m.email === input.email))
      throw new ApiError(409, "That email is already a member or invited");
    const m: Member = {
      id: nextId("usr"),
      name: "Pending invite",
      email: input.email,
      image: null,
      role: input.role,
      status: "invited",
      joinedAt: null,
      invitedAt: new Date(NOW).toISOString(),
    };
    db.members = [...db.members, m];
    return m;
  },
  updateMemberRole(id: string, role: Role): Member {
    const m = db.members.find((x) => x.id === id);
    if (!m) throw new ApiError(404, "Member not found");
    if (m.role === "owner") throw new ApiError(422, "The owner role cannot be reassigned here");
    m.role = role;
    return m;
  },
  removeMember(id: string): void {
    db.members = db.members.filter((m) => m.id !== id);
  },

  // helpers for selects
  allCoursesLite(): { id: string; title: string }[] {
    return db.courses.map((c) => ({ id: c.id, title: c.title }));
  },
  allStudentsLite(): { id: string; name: string; email: string }[] {
    return db.students.map((s) => ({ id: s.id, name: s.name, email: s.email }));
  },
  instructorsLite(): { id: string; name: string }[] {
    return db.members
      .filter((m) => m.role === "instructor" || m.role === "admin" || m.role === "owner")
      .map((m) => ({ id: m.id, name: m.name }));
  },
};
