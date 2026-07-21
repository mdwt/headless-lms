import "server-only";

/**
 * Server-side Learn reads for the student surface. Every call threads the
 * incoming request's session cookie via the per-call `headers` option (see
 * `server-call.ts`), never the shared SDK client.
 *
 * A 404 means the student isn't enrolled in (or can't see) the course — the
 * reads return `null` so the RSC page can `notFound()`.
 */
import { Learn } from "@headless-lms/sdk";

import { unwrap } from "./shared";
import { ensureConfigured, authHeaders } from "./server-call";
import type { Course, CourseSummary, Module } from "./types";

export const learnApi = {
  async listCourses(): Promise<CourseSummary[]> {
    ensureConfigured();
    return unwrap(await Learn.listLearnCourses(await authHeaders()));
  },
  async getCourse(courseId: string): Promise<Course | null> {
    ensureConfigured();
    const res = await Learn.getLearnCourse({ path: { courseId }, ...(await authHeaders()) });
    if (res.error) {
      if ((res.response?.status ?? 0) === 404) return null;
      throw new Error(`getCourse failed: ${res.response?.status}`);
    }
    return res.data ?? null;
  },
  async listModules(courseId: string): Promise<Module[] | null> {
    ensureConfigured();
    const res = await Learn.listLearnModules({ path: { courseId }, ...(await authHeaders()) });
    if (res.error) {
      if ((res.response?.status ?? 0) === 404) return null;
      throw new Error(`listModules failed: ${res.response?.status}`);
    }
    return res.data ?? null;
  },
};
