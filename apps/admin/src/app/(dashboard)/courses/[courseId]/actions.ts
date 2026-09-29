"use server";

// Server actions for course-builder (detail) mutations.

import { revalidatePath } from "next/cache";
import { Content, type JsonValueInput } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import type {
  ActivitySettings,
  Course,
  CourseSettings,
  Module,
  SaveActivityInput,
} from "@/lib/api/types";

/**
 * Revalidate the builder route AND the courses list. The `[courseId]` + "page"
 * scope revalidates the dynamic detail page for any course; module/activity
 * counts and course status/title also surface on the list, so revalidate both
 * to avoid cross-route staleness.
 */
function revalidateBuilder(): void {
  revalidatePath("/courses/[courseId]", "page");
  revalidatePath("/courses/[courseId]/content/[activityId]", "page");
  revalidatePath("/courses");
}

// --- modules ---------------------------------------------------------------

export async function reorderModulesAction(
  courseId: string,
  orderedIds: string[],
): Promise<Module[]> {
  const modules = await Content.reorderModules({ courseId, orderedIds }, await authHeaders());
  revalidateBuilder();
  return modules;
}

export async function createModuleAction(courseId: string, title: string): Promise<Module[]> {
  const modules = await Content.createModule({ courseId, title }, await authHeaders());
  revalidateBuilder();
  return modules;
}

export async function updateModuleAction(
  courseId: string,
  moduleId: string,
  title: string,
): Promise<Module[]> {
  const modules = await Content.updateModule({ courseId, moduleId, title }, await authHeaders());
  revalidateBuilder();
  return modules;
}

export async function deleteModuleAction(courseId: string, moduleId: string): Promise<Module[]> {
  const modules = await Content.deleteModule({ courseId, moduleId }, await authHeaders());
  revalidateBuilder();
  return modules;
}

// --- activities ------------------------------------------------------------

export async function reorderActivitiesAction(
  courseId: string,
  moduleId: string,
  orderedIds: string[],
): Promise<Module[]> {
  const modules = await Content.reorderActivities(
    { courseId, moduleId, orderedIds },
    await authHeaders(),
  );
  revalidateBuilder();
  return modules;
}

export async function saveActivityAction(
  courseId: string,
  moduleId: string,
  activity: SaveActivityInput,
): Promise<Module[]> {
  // Activities are uniform: the body is just the opaque settings + assets.
  const body = { settings: activity.settings as JsonValueInput, assetIds: activity.assetIds };
  const modules = activity.id
    ? await Content.updateActivity(
        { courseId, moduleId, activityId: activity.id, ...body },
        await authHeaders(),
      )
    : await Content.createActivity({ courseId, moduleId, ...body }, await authHeaders());
  revalidateBuilder();
  return modules;
}

export async function updateActivitySettingsAction(
  courseId: string,
  moduleId: string,
  activityId: string,
  patch: Partial<ActivitySettings>,
): Promise<void> {
  const headers = await authHeaders();
  const [activities, links] = await Promise.all([
    Content.listActivities({ courseId }, headers),
    Content.listActivityAssets({ courseId }, headers),
  ]);
  const activity = activities.find((a) => a.id === activityId && a.moduleId === moduleId);
  if (!activity) throw new Error("Activity not found");

  const settings: ActivitySettings = {
    ...((activity.settings ?? {}) as ActivitySettings),
    ...patch,
  };
  const assetIds = links.filter((l) => l.activityId === activityId).map((l) => l.assetId);
  await Content.updateActivity(
    { courseId, moduleId, activityId, settings: settings as JsonValueInput, assetIds },
    headers,
  );
  revalidateBuilder();
}

/** Publish/unpublish one activity. `published` lives in the settings blob. */
export async function setActivityPublishedAction(
  courseId: string,
  moduleId: string,
  activityId: string,
  published: boolean,
): Promise<void> {
  const headers = await authHeaders();
  const [activities, links] = await Promise.all([
    Content.listActivities({ courseId }, headers),
    Content.listActivityAssets({ courseId }, headers),
  ]);
  const activity = activities.find((a) => a.id === activityId && a.moduleId === moduleId);
  if (!activity) throw new Error("Activity not found");

  const settings: ActivitySettings = {
    ...((activity.settings ?? {}) as ActivitySettings),
    published,
  };
  const assetIds = links.filter((l) => l.activityId === activityId).map((l) => l.assetId);
  await Content.updateActivity(
    { courseId, moduleId, activityId, settings: settings as JsonValueInput, assetIds },
    headers,
  );
  revalidateBuilder();
}

export async function deleteActivityAction(
  courseId: string,
  moduleId: string,
  activityId: string,
): Promise<Module[]> {
  const modules = await Content.deleteActivity(
    { courseId, moduleId, activityId },
    await authHeaders(),
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
  const course = await Content.updateCourse({ id: courseId, status }, await authHeaders());
  revalidateBuilder();
  return course;
}

/**
 * Duplicate a course by composing existing endpoints: create the course, copy
 * its settings and thumbnail, then recreate every module and activity in seq
 * order (activities carry their settings blob and asset links verbatim).
 */
export async function duplicateCourseAction(courseId: string): Promise<Course> {
  const headers = await authHeaders();
  const [course, modules, activities, links] = await Promise.all([
    Content.getCourse({ id: courseId }, headers),
    Content.listModules({ courseId }, headers),
    Content.listActivities({ courseId }, headers),
    Content.listActivityAssets({ courseId }, headers),
  ]);

  const copy = await Content.createCourse(
    { title: `${course.title} (copy)`, description: course.description, category: course.category },
    headers,
  );
  await Content.updateCourseSettings({ id: copy.id, ...course.settings }, headers);
  if (course.thumbnailAssetId) {
    await Content.updateCourse({ id: copy.id, thumbnailAssetId: course.thumbnailAssetId }, headers);
  }

  const copiedModuleIds = new Set<string>();
  for (const mod of [...modules].sort((a, b) => a.seq - b.seq)) {
    const created = await Content.createModule({ courseId: copy.id, title: mod.title }, headers);
    const newModule = created.find((m) => !copiedModuleIds.has(m.id));
    if (!newModule) throw new Error("Couldn't resolve the duplicated module");
    copiedModuleIds.add(newModule.id);

    const moduleActivities = activities
      .filter((a) => a.moduleId === mod.id)
      .sort((a, b) => a.seq - b.seq);
    for (const activity of moduleActivities) {
      const assetIds = links.filter((l) => l.activityId === activity.id).map((l) => l.assetId);
      await Content.createActivity(
        {
          courseId: copy.id,
          moduleId: newModule.id,
          settings: activity.settings as JsonValueInput,
          assetIds,
        },
        headers,
      );
    }
  }

  revalidateBuilder();
  return copy;
}

/**
 * Course settings tab. Settings live in their own store behind
 * `PATCH /courses/:id/settings` — a partial patch, so omitted keys keep their
 * stored value. Returns the complete settings the server stored.
 */
export async function updateCourseSettingsAction(
  courseId: string,
  settings: Partial<CourseSettings>,
): Promise<CourseSettings> {
  const updated = await Content.updateCourseSettings(
    { id: courseId, ...settings },
    await authHeaders(),
  );
  revalidateBuilder();
  return updated;
}

/** Edit course details (title / category / description) from the builder sheet. */
export async function updateCourseDetailsAction(
  courseId: string,
  patch: { title: string; category: string; description: string },
): Promise<Course> {
  const course = await Content.updateCourse(
    {
      id: courseId,
      title: patch.title,
      category: patch.category,
      description: patch.description,
    },
    await authHeaders(),
  );
  revalidateBuilder();
  return course;
}
