"use server";

/**
 * Course Builder mutations as Server Actions — the write half of the pure-RSC
 * (BFF) model for the detail/builder route. Each runs on the server, calls the
 * API via the generated SDK with the incoming request's cookie forwarded
 * per-call (never mutating the shared SDK singleton — same rule as
 * `lib/api/server.ts`), then `revalidatePath`s the builder route so the next
 * render streams fresh course + module data down as props. No client-side
 * cache, no react-query.
 *
 * The module/activity write endpoints return the full, reordered module list;
 * we return it too (handy for callers), but correctness relies on
 * `revalidatePath`, not the return value.
 */

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { Courses, configureSdk } from "@headless-lms/sdk";

import { unwrap } from "@/lib/api/shared";
import type { Course, Module, SaveActivityInput } from "@/lib/api/types";

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

/**
 * Revalidate the builder route. The literal `[courseId]` segment + "page"
 * scope revalidates the dynamic detail page regardless of which course is open.
 */
function revalidateBuilder(): void {
  revalidatePath("/courses/[courseId]", "page");
}

// --- modules ---------------------------------------------------------------

export async function reorderModulesAction(
  courseId: string,
  orderedIds: string[],
): Promise<Module[]> {
  ensureConfigured();
  const modules = unwrap(
    await Courses.reorderModules({ path: { courseId }, body: { orderedIds }, ...(await auth()) }),
  );
  revalidateBuilder();
  return modules;
}

export async function createModuleAction(courseId: string, title: string): Promise<Module[]> {
  ensureConfigured();
  const modules = unwrap(
    await Courses.createModule({ path: { courseId }, body: { title }, ...(await auth()) }),
  );
  revalidateBuilder();
  return modules;
}

export async function updateModuleAction(
  courseId: string,
  moduleId: string,
  title: string,
): Promise<Module[]> {
  ensureConfigured();
  const modules = unwrap(
    await Courses.updateModule({
      path: { courseId, moduleId },
      body: { title },
      ...(await auth()),
    }),
  );
  revalidateBuilder();
  return modules;
}

export async function deleteModuleAction(courseId: string, moduleId: string): Promise<Module[]> {
  ensureConfigured();
  const modules = unwrap(
    await Courses.deleteModule({ path: { courseId, moduleId }, ...(await auth()) }),
  );
  revalidateBuilder();
  return modules;
}

// --- activities ------------------------------------------------------------

export async function reorderActivitiesAction(
  courseId: string,
  moduleId: string,
  orderedIds: string[],
): Promise<Module[]> {
  ensureConfigured();
  const modules = unwrap(
    await Courses.reorderActivities({
      path: { courseId, moduleId },
      body: { orderedIds },
      ...(await auth()),
    }),
  );
  revalidateBuilder();
  return modules;
}

export async function saveActivityAction(
  courseId: string,
  moduleId: string,
  activity: SaveActivityInput,
): Promise<Module[]> {
  ensureConfigured();
  // Activities are uniform: the body is just the opaque settings + assets.
  const body = { settings: activity.settings, assetIds: activity.assetIds };
  const modules = activity.id
    ? unwrap(
        await Courses.updateActivity({
          path: { courseId, moduleId, activityId: activity.id },
          body,
          ...(await auth()),
        }),
      )
    : unwrap(
        await Courses.createActivity({ path: { courseId, moduleId }, body, ...(await auth()) }),
      );
  revalidateBuilder();
  return modules;
}

export async function deleteActivityAction(
  courseId: string,
  moduleId: string,
  activityId: string,
): Promise<Module[]> {
  ensureConfigured();
  const modules = unwrap(
    await Courses.deleteActivity({
      path: { courseId, moduleId, activityId },
      ...(await auth()),
    }),
  );
  revalidateBuilder();
  return modules;
}

// --- course-level writes surfaced by the builder ---------------------------

/** Publish/unpublish from the builder header. */
export async function setCoursePublishedAction(
  courseId: string,
  status: Course["status"],
): Promise<Course> {
  ensureConfigured();
  const course = unwrap(
    await Courses.updateCourse({ path: { id: courseId }, body: { status }, ...(await auth()) }),
  );
  revalidateBuilder();
  return course;
}

/** Edit course details (title / category / description) from the builder sheet. */
export async function updateCourseDetailsAction(
  courseId: string,
  patch: { title: string; category: string; description: string },
): Promise<Course> {
  ensureConfigured();
  const course = unwrap(
    await Courses.updateCourse({
      path: { id: courseId },
      body: {
        title: patch.title,
        category: patch.category,
        description: patch.description,
      },
      ...(await auth()),
    }),
  );
  revalidateBuilder();
  return course;
}
