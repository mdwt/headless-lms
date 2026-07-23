import "server-only";

/**
 * Server-side Learn reads for the student surface. Every call threads the
 * incoming request's session cookie via the per-call `headers` option (see
 * `server-call.ts`), never the shared SDK client.
 *
 * A 404 means the student isn't enrolled in (or can't see) the course — the
 * reads return `null` so the RSC page can `notFound()`. A 401 means the session
 * doesn't resolve to a portal student at all → drop it and redirect to
 * /login?reset=1.
 */
import { Learn } from "@headless-lms/sdk";

import { redirectIfNoStudent, unwrap } from "./shared";
import { ensureConfigured, authHeaders } from "./server-call";
import type { Course, CourseSummary, Module, Org } from "./types";

export const learnApi = {
  async listCourses(): Promise<CourseSummary[]> {
    ensureConfigured();
    return unwrap(await Learn.listLearnCourses(await authHeaders()));
  },
  async org(): Promise<Org> {
    ensureConfigured();
    return unwrap(await Learn.getLearnOrg(await authHeaders()));
  },
  async getCourse(courseId: string): Promise<Course | null> {
    ensureConfigured();
    const res = await Learn.getLearnCourse({ path: { courseId }, ...(await authHeaders()) });
    if (res.error) {
      redirectIfNoStudent(res.response?.status);
      if ((res.response?.status ?? 0) === 404) return null;
      throw new Error(`getCourse failed: ${res.response?.status}`);
    }
    return res.data ?? null;
  },
  async listModules(courseId: string): Promise<Module[] | null> {
    ensureConfigured();
    const res = await Learn.listLearnModules({ path: { courseId }, ...(await authHeaders()) });
    if (res.error) {
      redirectIfNoStudent(res.response?.status);
      if ((res.response?.status ?? 0) === 404) return null;
      throw new Error(`listModules failed: ${res.response?.status}`);
    }
    return res.data ?? null;
  },
  async courseProgress(
    courseId: string,
  ): Promise<{ activities: Record<string, "in-progress" | "completed"> } | null> {
    ensureConfigured();
    const res = await Learn.getLearnCourseProgress({
      path: { courseId },
      ...(await authHeaders()),
    });
    if (res.error) {
      redirectIfNoStudent(res.response?.status);
      return null;
    }
    return res.data ?? null;
  },
};
