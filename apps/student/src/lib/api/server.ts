import "server-only";

/**
 * Server-side member reads for the student surface. Every call threads the
 * incoming request's session cookie via the per-call `headers` option (see
 * `server-call.ts`), never the shared SDK client.
 *
 * A 404 means the student isn't enrolled in (or can't see) the course — the
 * reads return `null` so the RSC page can `notFound()`. A 401 never reaches
 * here: the SDK's error mapping redirects to /session/reset, which revokes the
 * rejected session before handing over to /login.
 */
import { unstable_rethrow } from "next/navigation";
import { Assets, Content, Organizations, Progress } from "@headless-lms/sdk";

import { statusOf } from "./shared";
import { authHeaders } from "./server-call";
import type {
  Activity,
  Course,
  CourseSummary,
  Download,
  DownloadDetail,
  Module,
  Org,
  Viewer,
} from "./types";

/** Run a member read, mapping a 404 to `null` and rethrowing anything else. */
async function orNullOn404<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (e) {
    unstable_rethrow(e);
    if (statusOf(e) === 404) return null;
    throw e;
  }
}

/** Run a read whose failure is tolerable, degrading to `null`. The 401 handler
 *  redirects by throwing, so Next's control-flow errors have to pass through. */
async function orNull<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (e) {
    unstable_rethrow(e);
    return null;
  }
}

export const memberApi = {
  async listCourses(): Promise<CourseSummary[]> {
    return await Content.listMemberCourses(await authHeaders());
  },
  async org(): Promise<Org> {
    return await Organizations.getMemberOrg(await authHeaders());
  },
  async viewer(): Promise<Viewer> {
    return await Organizations.getMemberViewer(await authHeaders());
  },
  async getCourse(courseId: string): Promise<Course | null> {
    const headers = await authHeaders();
    return orNullOn404(() => Content.getMemberCourse({ courseId }, headers));
  },
  async listModules(courseId: string): Promise<Module[] | null> {
    const headers = await authHeaders();
    return orNullOn404(() => Content.listMemberModules({ courseId }, headers));
  },
  /** Bare published-activity rows for an enrolled course. */
  async listActivities(courseId: string): Promise<Activity[] | null> {
    const headers = await authHeaders();
    return orNullOn404(() => Content.listMemberActivities({ courseId }, headers));
  },
  /** Progress is decoration on an otherwise-renderable page, so any failure
   *  (other than the 401 redirect) degrades to "no progress" rather than
   *  taking the page down. */
  async courseProgress(courseId: string): Promise<{
    activities: Record<string, "in-progress" | "completed">;
    positions: Record<string, unknown>;
  } | null> {
    const headers = await authHeaders();
    return orNull(() => Progress.getMemberCourseProgress({ courseId }, headers));
  },
  async listDownloads(): Promise<Download[]> {
    return await Content.listMemberDownloads(await authHeaders());
  },
  async getDownload(downloadId: string): Promise<DownloadDetail | null> {
    const headers = await authHeaders();
    return orNullOn404(() => Content.getMemberDownload({ downloadId }, headers));
  },
  async assetUrl(
    assetId: string,
    via: Parameters<typeof Assets.getAssetDownloadUrl>[0]["via"],
  ): Promise<string | null> {
    const headers = await authHeaders();
    const ticket = await orNull(() => Assets.getAssetDownloadUrl({ id: assetId, via }, headers));
    return ticket?.url ?? null;
  },
};
