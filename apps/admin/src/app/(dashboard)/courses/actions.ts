"use server";

// Server actions for course mutations.

import { revalidatePath } from "next/cache";
import { Courses } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, unwrap, expectOk } from "@/lib/api/server-call";
import type { Course } from "@/lib/api/types";

/** Course-level writes surface on both the list and that course's builder page. */
function revalidateCourse(): void {
  revalidatePath("/courses");
  revalidatePath("/courses/[courseId]", "page");
}

export interface CourseInput {
  title: string;
  category?: string;
  description?: string;
}

export async function createCourseAction(input: CourseInput): Promise<Course> {
  ensureConfigured();
  const course = unwrap(
    await Courses.createCourse({
      body: { title: input.title, description: input.description, category: input.category },
      ...(await authHeaders()),
    }),
  );
  revalidateCourse();
  return course;
}

export async function updateCourseAction(
  id: string,
  patch: CourseInput & { status?: Course["status"] },
): Promise<Course> {
  ensureConfigured();
  const course = unwrap(
    await Courses.updateCourse({
      path: { id },
      body: {
        title: patch.title,
        description: patch.description,
        category: patch.category,
        status: patch.status,
      },
      ...(await authHeaders()),
    }),
  );
  revalidateCourse();
  return course;
}

/** Publish/unpublish — a targeted status write for the row action + optimism. */
export async function setCoursePublishedAction(
  id: string,
  status: Course["status"],
): Promise<void> {
  ensureConfigured();
  unwrap(await Courses.updateCourse({ path: { id }, body: { status }, ...(await authHeaders()) }));
  revalidateCourse();
}

export async function deleteCourseAction(id: string): Promise<void> {
  ensureConfigured();
  expectOk(await Courses.deleteCourse({ path: { id }, ...(await authHeaders()) }));
  revalidateCourse();
}
