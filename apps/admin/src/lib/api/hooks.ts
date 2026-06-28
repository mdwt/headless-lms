"use client";

/**
 * TanStack Query hooks, grouped by domain. Every mutation invalidates the
 * right domain root so lists, detail views, and the overview counts stay
 * coherent. Optimistic updates are used where rollback is safe (publish
 * toggles, enrollment status, role changes).
 */

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { api, type Caller } from "./client";
import { qk } from "../query-keys";
import type {
  Course,
  Enrollment,
  ListParams,
  Member,
  ModuleItem,
  Paginated,
  Role,
} from "./types";

// --- dashboard -------------------------------------------------------------

export function useOverview() {
  return useQuery({ queryKey: qk.overview, queryFn: () => api.overview() });
}

// --- courses ---------------------------------------------------------------

export function useCourses(params: ListParams, caller: Caller) {
  const scope = caller.role === "instructor" ? `inst:${caller.scopedCourseIds.join(",")}` : "all";
  return useQuery({
    queryKey: qk.courses.list(params, scope),
    queryFn: () => api.listCourses(params, caller),
    placeholderData: keepPreviousData,
  });
}

export function useCourse(id: string) {
  return useQuery({ queryKey: qk.courses.detail(id), queryFn: () => api.getCourse(id) });
}

export function useCoursesLite() {
  return useQuery({ queryKey: qk.courses.lite, queryFn: () => api.coursesLite() });
}

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Course>) => api.createCourse(input),
    onSuccess: (course) => {
      qc.invalidateQueries({ queryKey: qk.courses.all });
      qc.invalidateQueries({ queryKey: qk.overview });
      toast.success("Course created", { description: course.title });
    },
    onError: (e) => toast.error("Couldn't create course", { description: e.message }),
  });
}

export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Course> }) => api.updateCourse(id, patch),
    onSuccess: (course) => {
      qc.invalidateQueries({ queryKey: qk.courses.all });
      qc.setQueryData(qk.courses.detail(course.id), course);
      toast.success("Changes saved");
    },
    onError: (e) => toast.error("Couldn't save changes", { description: e.message }),
  });
}

/** Publish/unpublish with an optimistic flip of the detail cache. */
export function useToggleCoursePublish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ course }: { course: Course }) =>
      api.updateCourse(course.id, { status: course.status === "published" ? "draft" : "published" }),
    onMutate: async ({ course }) => {
      await qc.cancelQueries({ queryKey: qk.courses.detail(course.id) });
      const prev = qc.getQueryData<Course>(qk.courses.detail(course.id));
      qc.setQueryData<Course>(qk.courses.detail(course.id), (c) =>
        c ? { ...c, status: c.status === "published" ? "draft" : "published" } : c,
      );
      return { prev };
    },
    onError: (e, { course }, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.courses.detail(course.id), ctx.prev);
      toast.error("Couldn't update status", { description: (e as Error).message });
    },
    onSuccess: (course) => {
      toast.success(course.status === "published" ? "Course published" : "Moved to draft");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.courses.all });
      qc.invalidateQueries({ queryKey: qk.overview });
    },
  });
}

export function useDeleteCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteCourse(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.courses.all });
      qc.invalidateQueries({ queryKey: qk.overview });
      toast.success("Course deleted");
    },
    onError: (e) => toast.error("Couldn't delete course", { description: e.message }),
  });
}

// --- modules + items -------------------------------------------------------

export function useModules(courseId: string) {
  return useQuery({ queryKey: qk.courses.modules(courseId), queryFn: () => api.listModules(courseId) });
}

function useModuleMutation<TArgs>(
  courseId: string,
  fn: (args: TArgs) => Promise<unknown>,
  successMsg?: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.courses.modules(courseId) });
      qc.invalidateQueries({ queryKey: qk.courses.all });
      if (successMsg) toast.success(successMsg);
    },
    onError: (e) => toast.error("Something went wrong", { description: (e as Error).message }),
  });
}

export function useReorderModules(courseId: string) {
  return useModuleMutation(courseId, (orderedIds: string[]) =>
    api.reorderModules(courseId, orderedIds),
  );
}
export function useReorderItems(courseId: string) {
  return useModuleMutation(courseId, ({ moduleId, orderedIds }: { moduleId: string; orderedIds: string[] }) =>
    api.reorderItems(courseId, moduleId, orderedIds),
  );
}
export function useCreateModule(courseId: string) {
  return useModuleMutation(courseId, (title: string) => api.createModule(courseId, title), "Module added");
}
export function useUpdateModule(courseId: string) {
  return useModuleMutation(courseId, ({ moduleId, title }: { moduleId: string; title: string }) =>
    api.updateModule(courseId, moduleId, title), "Module renamed");
}
export function useDeleteModule(courseId: string) {
  return useModuleMutation(courseId, (moduleId: string) => api.deleteModule(courseId, moduleId), "Module deleted");
}
export function useSaveItem(courseId: string) {
  return useModuleMutation(
    courseId,
    ({ moduleId, item }: { moduleId: string; item: Partial<ModuleItem> & { id?: string } }) =>
      api.saveItem(courseId, moduleId, item),
    "Saved",
  );
}
export function useDeleteItem(courseId: string) {
  return useModuleMutation(
    courseId,
    ({ moduleId, itemId }: { moduleId: string; itemId: string }) =>
      api.deleteItem(courseId, moduleId, itemId),
    "Item deleted",
  );
}

// --- students --------------------------------------------------------------

export function useStudents(params: ListParams) {
  return useQuery({
    queryKey: qk.students.list(params),
    queryFn: () => api.listStudents(params),
    placeholderData: keepPreviousData,
  });
}
export function useStudent(id: string) {
  return useQuery({ queryKey: qk.students.detail(id), queryFn: () => api.getStudent(id) });
}
export function useStudentEnrollments(id: string) {
  return useQuery({ queryKey: qk.students.enrollments(id), queryFn: () => api.studentEnrollments(id) });
}
export function useStudentsLite() {
  return useQuery({ queryKey: qk.students.lite, queryFn: () => api.studentsLite() });
}

// --- enrollments -----------------------------------------------------------

export function useEnrollments(params: ListParams) {
  return useQuery({
    queryKey: qk.enrollments.list(params),
    queryFn: () => api.listEnrollments(params),
    placeholderData: keepPreviousData,
  });
}

export function useGrantEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { studentId: string; courseId: string; expiresAt: string | null }) =>
      api.grantEnrollment(input),
    onSuccess: (e) => {
      qc.invalidateQueries({ queryKey: qk.enrollments.all });
      qc.invalidateQueries({ queryKey: qk.overview });
      toast.success("Access granted", { description: `${e.studentName} → ${e.courseTitle}` });
    },
    onError: (e) => toast.error("Couldn't grant access", { description: e.message }),
  });
}

export function useSetEnrollmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "revoke" | "reinstate" }) =>
      action === "revoke" ? api.revokeEnrollment(id) : api.reinstateEnrollment(id),
    onSuccess: (_e, { action }) => {
      qc.invalidateQueries({ queryKey: qk.enrollments.all });
      qc.invalidateQueries({ queryKey: qk.overview });
      toast.success(action === "revoke" ? "Access revoked" : "Access reinstated");
    },
    onError: (e) => toast.error("Couldn't update access", { description: e.message }),
  });
}

// --- grading ---------------------------------------------------------------

export function useSubmissions(params: ListParams) {
  return useQuery({
    queryKey: qk.submissions.list(params),
    queryFn: () => api.listSubmissions(params),
    placeholderData: keepPreviousData,
  });
}

export function useGradeSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, score, feedback }: { id: string; score: number; feedback: string }) =>
      api.gradeSubmission(id, { score, feedback }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.submissions.all });
      qc.invalidateQueries({ queryKey: qk.overview });
      toast.success("Grade submitted");
    },
    onError: (e) => toast.error("Couldn't submit grade", { description: e.message }),
  });
}

// --- team ------------------------------------------------------------------

export function useMembers(params: ListParams) {
  return useQuery({
    queryKey: qk.members.list(params),
    queryFn: () => api.listMembers(params),
    placeholderData: keepPreviousData,
  });
}

export function useInviteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; role: Role }) => api.inviteMember(input),
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: qk.members.all });
      toast.success("Invitation sent", { description: m.email });
    },
    onError: (e) => toast.error("Couldn't send invite", { description: e.message }),
  });
}

export function useUpdateMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => api.updateMemberRole(id, role),
    onMutate: async ({ id, role }) => {
      await qc.cancelQueries({ queryKey: qk.members.all });
      const snapshots = qc.getQueriesData<Paginated<Member>>({ queryKey: qk.members.all });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        qc.setQueryData<Paginated<Member>>(key, {
          ...data,
          rows: data.rows.map((m) => (m.id === id ? { ...m, role } : m)),
        });
      }
      return { snapshots };
    },
    onError: (e, _v, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error("Couldn't change role", { description: (e as Error).message });
    },
    onSuccess: () => toast.success("Role updated"),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.members.all }),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.removeMember(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.members.all });
      toast.success("Member removed");
    },
    onError: (e) => toast.error("Couldn't remove member", { description: e.message }),
  });
}

export type { Enrollment };
