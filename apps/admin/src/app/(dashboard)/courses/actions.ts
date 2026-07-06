"use server";

/**
 * Courses mutations as Server Actions — the write half of the pure-RSC (BFF)
 * model. Each runs on the server, calls the API via the generated SDK with the
 * incoming request's cookie forwarded per-call (never mutating the shared SDK
 * singleton — same rule as `lib/api/server.ts`), then `revalidatePath`s the
 * list so the next render streams fresh rows. No client-side cache, no
 * react-query: the server owns the data, `revalidatePath` is the refresh.
 */

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { Courses, configureSdk } from "@headless-lms/sdk";

import { unwrap, expectOk } from "@/lib/api/shared";
import type { Course } from "@/lib/api/types";

const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  configureSdk({ baseUrl: API_URL });
  configured = true;
}

/** Per-call header bag forwarding the caller's session cookie to the API. */
async function auth(): Promise<{ headers: { cookie: string } }> {
  return { headers: { cookie: (await cookies()).toString() } };
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
      ...(await auth()),
    }),
  );
  revalidatePath("/courses");
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
      ...(await auth()),
    }),
  );
  revalidatePath("/courses");
  return course;
}

/** Publish/unpublish — a targeted status write for the row action + optimism. */
export async function setCoursePublishedAction(
  id: string,
  status: Course["status"],
): Promise<void> {
  ensureConfigured();
  unwrap(await Courses.updateCourse({ path: { id }, body: { status }, ...(await auth()) }));
  revalidatePath("/courses");
}

export async function deleteCourseAction(id: string): Promise<void> {
  ensureConfigured();
  expectOk(await Courses.deleteCourse({ path: { id }, ...(await auth()) }));
  revalidatePath("/courses");
}
