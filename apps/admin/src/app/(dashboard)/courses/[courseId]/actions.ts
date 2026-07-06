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
import { Courses } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, unwrap } from "@/lib/api/server-call";
import type { Course, Module, SaveActivityInput } from "@/lib/api/types";

/**
 * Revalidate the builder route AND the courses list. The `[courseId]` + "page"
 * scope revalidates the dynamic detail page for any course; module/activity
 * counts and course status/title also surface on the list, so revalidate both
 * to avoid cross-route staleness.
 */
function revalidateBuilder(): void {
  revalidatePath("/courses/[courseId]", "page");
  revalidatePath("/courses");
}

// --- modules ---------------------------------------------------------------

export async function reorderModulesAction(
  courseId: string,
  orderedIds: string[],
): Promise<Module[]> {
  ensureConfigured();
  const modules = unwrap(
    await Courses.reorderModules({ path: { courseId }, body: { orderedIds }, ...(await authHeaders()) }),
  );
  revalidateBuilder();
  return modules;
}

export async function createModuleAction(courseId: string, title: string): Promise<Module[]> {
  ensureConfigured();
  const modules = unwrap(
    await Courses.createModule({ path: { courseId }, body: { title }, ...(await authHeaders()) }),
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
      ...(await authHeaders()),
    }),
  );
  revalidateBuilder();
  return modules;
}

export async function deleteModuleAction(courseId: string, moduleId: string): Promise<Module[]> {
  ensureConfigured();
  const modules = unwrap(
    await Courses.deleteModule({ path: { courseId, moduleId }, ...(await authHeaders()) }),
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
      ...(await authHeaders()),
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
          ...(await authHeaders()),
        }),
      )
    : unwrap(
        await Courses.createActivity({ path: { courseId, moduleId }, body, ...(await authHeaders()) }),
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
      ...(await authHeaders()),
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
    await Courses.updateCourse({ path: { id: courseId }, body: { status }, ...(await authHeaders()) }),
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
      ...(await authHeaders()),
    }),
  );
  revalidateBuilder();
  return course;
}
