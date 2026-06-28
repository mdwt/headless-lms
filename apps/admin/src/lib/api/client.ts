/**
 * Typed API client. Every hook and component talks to this object only — the
 * mock transport below is the *only* place that knows the backend is fake.
 *
 * To go live against the real REST API, replace each method body with a
 * `fetch` call, e.g.:
 *
 *   async listCourses(params) {
 *     const res = await fetch(`${BASE}/courses?${qs(params)}`, { headers: authHeaders() });
 *     if (!res.ok) throw new ApiError(res.status, await res.text());
 *     return res.json();
 *   }
 *
 * Signatures, return types, and the thrown `ApiError` stay identical, so no
 * hook or component changes.
 */

import { latency } from "./http";
import { mockServer } from "./mock-server";
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

/** Role + scope of the caller — the real API derives this from the session. */
export interface Caller {
  role: Role;
  scopedCourseIds: string[];
}

async function ok<T>(value: T): Promise<T> {
  await latency();
  return value;
}

export const api = {
  // dashboard
  async overview(): Promise<OverviewStats> {
    return ok(mockServer.overview());
  },

  // courses
  async listCourses(params: ListParams, caller: Caller): Promise<Paginated<Course>> {
    return ok(mockServer.listCourses(params, caller.role, caller.scopedCourseIds));
  },
  async getCourse(id: string): Promise<Course> {
    return ok(mockServer.getCourse(id));
  },
  async createCourse(input: Partial<Course>): Promise<Course> {
    return ok(mockServer.createCourse(input));
  },
  async updateCourse(id: string, patch: Partial<Course>): Promise<Course> {
    return ok(mockServer.updateCourse(id, patch));
  },
  async deleteCourse(id: string): Promise<void> {
    return ok(mockServer.deleteCourse(id));
  },

  // modules + items
  async listModules(courseId: string): Promise<Module[]> {
    return ok(mockServer.listModules(courseId));
  },
  async reorderModules(courseId: string, orderedIds: string[]): Promise<Module[]> {
    return ok(mockServer.reorderModules(courseId, orderedIds));
  },
  async reorderItems(courseId: string, moduleId: string, orderedIds: string[]): Promise<Module[]> {
    return ok(mockServer.reorderItems(courseId, moduleId, orderedIds));
  },
  async createModule(courseId: string, title: string): Promise<Module[]> {
    return ok(mockServer.createModule(courseId, title));
  },
  async updateModule(courseId: string, moduleId: string, title: string): Promise<Module[]> {
    return ok(mockServer.updateModule(courseId, moduleId, title));
  },
  async deleteModule(courseId: string, moduleId: string): Promise<Module[]> {
    return ok(mockServer.deleteModule(courseId, moduleId));
  },
  async saveItem(
    courseId: string,
    moduleId: string,
    item: Partial<ModuleItem> & { id?: string },
  ): Promise<Module[]> {
    return ok(mockServer.saveItem(courseId, moduleId, item));
  },
  async deleteItem(courseId: string, moduleId: string, itemId: string): Promise<Module[]> {
    return ok(mockServer.deleteItem(courseId, moduleId, itemId));
  },

  // students
  async listStudents(params: ListParams): Promise<Paginated<Student>> {
    return ok(mockServer.listStudents(params));
  },
  async getStudent(id: string): Promise<Student> {
    return ok(mockServer.getStudent(id));
  },
  async studentEnrollments(id: string): Promise<Enrollment[]> {
    return ok(mockServer.studentEnrollments(id));
  },

  // enrollments
  async listEnrollments(params: ListParams): Promise<Paginated<Enrollment>> {
    return ok(mockServer.listEnrollments(params));
  },
  async grantEnrollment(input: {
    studentId: string;
    courseId: string;
    expiresAt: string | null;
  }): Promise<Enrollment> {
    return ok(mockServer.grantEnrollment(input));
  },
  async revokeEnrollment(id: string): Promise<Enrollment> {
    return ok(mockServer.revokeEnrollment(id));
  },
  async reinstateEnrollment(id: string): Promise<Enrollment> {
    return ok(mockServer.reinstateEnrollment(id));
  },

  // grading
  async listSubmissions(params: ListParams): Promise<Paginated<Submission>> {
    return ok(mockServer.listSubmissions(params));
  },
  async gradeSubmission(id: string, input: { score: number; feedback: string }): Promise<Submission> {
    return ok(mockServer.gradeSubmission(id, input));
  },

  // team
  async listMembers(params: ListParams): Promise<Paginated<Member>> {
    return ok(mockServer.listMembers(params));
  },
  async inviteMember(input: { email: string; role: Role }): Promise<Member> {
    return ok(mockServer.inviteMember(input));
  },
  async updateMemberRole(id: string, role: Role): Promise<Member> {
    return ok(mockServer.updateMemberRole(id, role));
  },
  async removeMember(id: string): Promise<void> {
    return ok(mockServer.removeMember(id));
  },

  // option sources for selects
  async coursesLite(): Promise<{ id: string; title: string }[]> {
    return ok(mockServer.allCoursesLite());
  },
  async studentsLite(): Promise<{ id: string; name: string; email: string }[]> {
    return ok(mockServer.allStudentsLite());
  },
  async instructorsLite(): Promise<{ id: string; name: string }[]> {
    return ok(mockServer.instructorsLite());
  },
};

export type { Assessment, Lesson };
