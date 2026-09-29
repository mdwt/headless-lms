import "server-only";

/**
 * Server-side reads used by Server Components to prefetch data for React-Query
 * hydration.
 *
 * The SDK `client` is a module-level singleton with a global `credentials:
 * "include"`. On the server it is shared across all concurrent requests/users,
 * so mutating it to attach a per-request cookie would leak cookies between
 * users. Instead every call threads the incoming request's cookie via the
 * per-call `headers` option — never `client.setConfig` with request state.
 * `configureSdk` only sets the (constant) baseUrl and the error mapping.
 *
 * The API serves bare model rows; every display shape the dashboard needs —
 * the module→activity tree, entitlement rows joined with student identity and
 * content titles, download assets joined with file metadata — is composed here
 * from multiple bare reads (see lib/api/compose).
 *
 * Only SSR-prefetched **read** methods live here. Mutations and browser-only
 * flows (`uploadAsset`, presigned `assetDownloadUrl`, `useAssetUrl`) stay
 * client-side and are never prefetched. Query serialization goes through the
 * shared `toQuery` so prefetch keys match client keys exactly (cache hit, no
 * refetch on first paint).
 */

import {
  Assets,
  Automations,
  Content,
  Discussion,
  Entitlements,
  Integrations,
  Organizations,
  Reporting,
} from "@headless-lms/sdk";

import { toQuery } from "./shared";
import { buildModuleTree, entitlementStatusOf } from "./compose";
import { fullName } from "@/lib/format";
import { authHeaders } from "./server-call";
import type {
  Asset,
  Automation,
  AutomationKind,
  AutomationRunsPage,
  BundleRow,
  AutomationTriggerInfo,
  AvailableAction,
  AvailableIntegration,
  Course,
  CourseAnalytics,
  Download,
  DownloadAsset,
  EnrollmentSeries,
  Entitlement,
  EntitlementGrant,
  IntegrationConnection,
  ListParams,
  Member,
  ModuleTree,
  OverviewStats,
  Paginated,
  CommentListItem,
  Student,
  StudentAnalytics,
  Webhook,
} from "./types";

/** Resolve a granted content id to its type + display title. The grant row
 *  stores only the id, so probe the two content resources in order. */
async function contentRefOf(
  contentId: string,
  headers: Awaited<ReturnType<typeof authHeaders>>,
): Promise<Entitlement["content"]> {
  try {
    const course = await Content.getCourse({ id: contentId }, headers);
    return { id: contentId, type: "course", title: course.title };
  } catch {
    // fall through to download
  }
  try {
    const download = await Content.getDownload({ downloadId: contentId }, headers);
    return { id: contentId, type: "download", title: download.title };
  } catch {
    return { id: contentId, type: "course", title: contentId };
  }
}

/** Join bare grant rows with student identity + target titles (one fetch per
 *  unique id, in parallel) and derive the display status. A grant targets
 *  either a content item or a bundle. */
async function composeEntitlements(grants: EntitlementGrant[]): Promise<Entitlement[]> {
  const headers = await authHeaders();
  const studentIds = [...new Set(grants.map((g) => g.orgUserId))];
  const contentIds = [...new Set(grants.map((g) => g.contentId).filter((id) => id !== null))];
  const bundleIds = [...new Set(grants.map((g) => g.bundleId).filter((id) => id !== null))];
  const [students, contentRefs, bundleRefs] = await Promise.all([
    Promise.all(
      studentIds.map(async (id) => {
        try {
          return await Organizations.getStudent({ id }, headers);
        } catch {
          return null;
        }
      }),
    ),
    Promise.all(contentIds.map((id) => contentRefOf(id, headers))),
    Promise.all(
      bundleIds.map(async (id): Promise<Entitlement["content"]> => {
        try {
          const bundle = await Content.getBundle({ bundleId: id }, headers);
          return { id, type: "bundle", title: bundle.name };
        } catch {
          return { id, type: "bundle", title: id };
        }
      }),
    ),
  ]);
  const studentById = new Map(students.filter((s) => s !== null).map((s) => [s.id, s]));
  const refById = new Map([...contentRefs, ...bundleRefs].map((r) => [r.id, r]));
  return grants.map((g) => {
    const student = studentById.get(g.orgUserId);
    const targetId = g.contentId ?? g.bundleId;
    return {
      ...g,
      status: entitlementStatusOf(g),
      firstName: student?.firstName ?? null,
      lastName: student?.lastName ?? null,
      email: student?.email ?? "",
      content: (targetId ? refById.get(targetId) : undefined) ?? {
        id: targetId ?? g.id,
        type: "course",
        title: targetId ?? "Unknown",
      },
    };
  });
}

/** Join bare download→asset link rows with each asset's file metadata. Also
 *  used by the download-asset server actions to return display rows. */
export async function composeDownloadAssets(
  links: Awaited<ReturnType<typeof Content.listDownloadAssets>>,
): Promise<DownloadAsset[]> {
  const headers = await authHeaders();
  const assetIds = [...new Set(links.map((l) => l.assetId))];
  const assets = await Promise.all(assetIds.map((id) => Assets.getAsset({ id }, headers)));
  const assetById = new Map(assets.map((a) => [a.id, a]));
  return links.map((l) => {
    const asset = assetById.get(l.assetId);
    return {
      ...l,
      filename: asset?.filename ?? l.assetId,
      contentType: asset?.contentType ?? "application/octet-stream",
      size: asset?.size ?? 0,
    };
  });
}

export const serverApi = {
  // reporting
  async overview(): Promise<OverviewStats> {
    return await Reporting.getOverview(await authHeaders());
  },
  async enrollmentSeries(days: number): Promise<EnrollmentSeries> {
    return await Reporting.getEnrollmentSeries({ days }, await authHeaders());
  },
  async courseAnalytics(courseId: string): Promise<CourseAnalytics> {
    return await Reporting.getCourseAnalytics({ id: courseId }, await authHeaders());
  },
  async courseEnrollmentSeries(courseId: string, days: number): Promise<EnrollmentSeries> {
    return await Reporting.getCourseEnrollmentSeries({ id: courseId, days }, await authHeaders());
  },

  // courses
  async listCourses(params: ListParams): Promise<Paginated<Course>> {
    return await Content.listCourses(toQuery(params, ["status", "category"]), await authHeaders());
  },
  async getCourse(id: string): Promise<Course> {
    return await Content.getCourse({ id }, await authHeaders());
  },
  /** The builder's module→activity tree, composed from the three bare lists. */
  async moduleTree(courseId: string): Promise<ModuleTree[]> {
    const headers = await authHeaders();
    const [modules, activities, links] = await Promise.all([
      Content.listModules({ courseId }, headers),
      Content.listActivities({ courseId }, headers),
      Content.listActivityAssets({ courseId }, headers),
    ]);
    return buildModuleTree(modules, activities, links);
  },
  // Every grantable target offered by the entitlements grant pickers, tagged
  // with its type so the UI can group them. Bundles lead the list and carry
  // their item titles so the picker can show what a bundle contains.
  async contentLite(): Promise<
    (
      | { id: string; title: string; type: "course" | "download" }
      | { id: string; title: string; type: "bundle"; itemTitles: string[] }
    )[]
  > {
    const headers = await authHeaders();
    const [coursesPage, downloadsPage, bundlesPage] = await Promise.all([
      Content.listCourses({ pageSize: 100, sort: "title" }, headers),
      Content.listDownloads({ pageSize: 100, sort: "title" }, headers),
      Content.listBundles({ pageSize: 100, sort: "name" }, headers),
    ]);
    const bundleItems = await Promise.all(
      bundlesPage.rows.map((b) => Content.listBundleItems({ bundleId: b.id }, headers)),
    );
    const titleById = new Map([
      ...coursesPage.rows.map((c) => [c.id, c.title] as const),
      ...downloadsPage.rows.map((d) => [d.id, d.title] as const),
    ]);
    const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title);
    const bundles = bundlesPage.rows
      .map((b, i) => ({
        id: b.id,
        title: b.name,
        type: "bundle" as const,
        itemTitles: bundleItems[i].map((item) => titleById.get(item.contentId) ?? item.contentId),
      }))
      .sort(byTitle);
    const courses = coursesPage.rows
      .map((c) => ({ id: c.id, title: c.title, type: "course" as const }))
      .sort(byTitle);
    const downloads = downloadsPage.rows
      .map((d) => ({ id: d.id, title: d.title, type: "download" as const }))
      .sort(byTitle);
    return [...bundles, ...courses, ...downloads];
  },

  // bundles
  /** Rows joined with their item contentIds — count column + edit-dialog seed. */
  async listBundles(params: ListParams): Promise<Paginated<BundleRow>> {
    const headers = await authHeaders();
    const page = await Content.listBundles(toQuery(params, []), headers);
    const items = await Promise.all(
      page.rows.map((b) => Content.listBundleItems({ bundleId: b.id }, headers)),
    );
    return {
      ...page,
      rows: page.rows.map((b, i) => ({
        ...b,
        contentIds: items[i].map((item) => item.contentId),
      })),
    };
  },

  // downloads
  async listDownloads(params: ListParams): Promise<Paginated<Download>> {
    return await Content.listDownloads(
      toQuery(params, ["status", "category"]),
      await authHeaders(),
    );
  },
  async getDownload(downloadId: string): Promise<Download> {
    return await Content.getDownload({ downloadId }, await authHeaders());
  },
  async listDownloadAssets(downloadId: string): Promise<DownloadAsset[]> {
    const links = await Content.listDownloadAssets({ downloadId }, await authHeaders());
    return composeDownloadAssets(links);
  },
  /** Header stats for one download, composed from its assets + grants. */
  async downloadStats(
    downloadId: string,
  ): Promise<{ assetCount: number; totalSize: number; entitledCount: number }> {
    const [assets, entitled] = await Promise.all([
      this.listDownloadAssets(downloadId),
      Entitlements.listEntitlements(
        { contentId: downloadId, status: "active", page: 1, pageSize: 1 },
        await authHeaders(),
      ),
    ]);
    return {
      assetCount: assets.length,
      totalSize: assets.reduce((sum, a) => sum + a.size, 0),
      entitledCount: entitled.total,
    };
  },

  // students
  async listStudents(params: ListParams): Promise<Paginated<Student>> {
    return await Organizations.listStudents(toQuery(params, []), await authHeaders());
  },
  async getStudent(id: string): Promise<Student> {
    return await Organizations.getStudent({ id }, await authHeaders());
  },
  async studentAnalytics(id: string): Promise<StudentAnalytics> {
    return await Reporting.getStudentAnalytics({ id }, await authHeaders());
  },
  async studentEntitlements(orgUserId: string): Promise<Entitlement[]> {
    const page = await Entitlements.listEntitlements(
      { orgUserId, page: 1, pageSize: 100 },
      await authHeaders(),
    );
    return composeEntitlements(page.rows);
  },
  async studentsLite(search?: string): Promise<{ id: string; name: string; email: string }[]> {
    const page = await Organizations.listStudents(
      { page: 1, pageSize: 100, search: search || undefined, sort: "name" },
      await authHeaders(),
    );
    return page.rows.map((s) => ({ id: s.id, name: fullName(s), email: s.email }));
  },

  // entitlements
  async listEntitlements(params: ListParams): Promise<Paginated<Entitlement>> {
    const page = await Entitlements.listEntitlements(
      toQuery(params, ["status", "source"]),
      await authHeaders(),
    );
    return { ...page, rows: await composeEntitlements(page.rows) };
  },
  async contentEntitlements(contentId: string): Promise<Entitlement[]> {
    const page = await Entitlements.listEntitlements(
      { contentId, page: 1, pageSize: 100 },
      await authHeaders(),
    );
    return composeEntitlements(page.rows);
  },

  // discussion (the comment list; settings ride on the course payload)
  /** The staff comment list, scoped to one course. `status` and `reported` are
   *  the two facets the Comments tab exposes; `reported` goes over the wire as
   *  a string because query values always do. */
  async listComments(courseId: string, params: ListParams): Promise<Paginated<CommentListItem>> {
    const { reported, ...query } = toQuery(params, ["status", "reported"]);
    return await Discussion.listComments(
      {
        ...query,
        courseId,
        ...(reported === undefined ? {} : { reported: String(reported) }),
      },
      await authHeaders(),
    );
  },

  // members
  async listMembers(params: ListParams): Promise<Paginated<Member>> {
    return await Organizations.listMembers(
      toQuery(params, ["role", "status"]),
      await authHeaders(),
    );
  },
  async instructorsLite(): Promise<{ id: string; name: string }[]> {
    const page = await Organizations.listMembers({ pageSize: 100 }, await authHeaders());
    return page.rows
      .filter((m) => m.role === "owner" || m.role === "admin" || m.role === "instructor")
      .map((m) => ({ id: m.id, name: fullName(m) }));
  },

  // media library (assets) — list only; presigned URL/upload stay client-side
  async listAssets(params: ListParams): Promise<Paginated<Asset>> {
    return await Assets.listAssets(toQuery(params, ["kind"]), await authHeaders());
  },

  // integrations
  async listAvailableIntegrations(): Promise<AvailableIntegration[]> {
    return await Integrations.listAvailableIntegrations(await authHeaders());
  },
  async listConnections(): Promise<IntegrationConnection[]> {
    return await Integrations.listConnections(await authHeaders());
  },

  // automations
  async listAutomations(kind?: AutomationKind): Promise<Automation[]> {
    return await Automations.listAutomations({ kind }, await authHeaders());
  },
  async listAutomationRuns(id: string, params: ListParams): Promise<AutomationRunsPage> {
    return await Automations.listAutomationRuns(
      { id, ...toQuery(params, ["status"]) },
      await authHeaders(),
    );
  },
  async listWebhooks(): Promise<Webhook[]> {
    return await Automations.listWebhooks(await authHeaders());
  },
  async getWebhook(id: string): Promise<Webhook> {
    return await Automations.getWebhook({ id }, await authHeaders());
  },
  async getAutomation(id: string): Promise<Automation> {
    return await Automations.getAutomation({ id }, await authHeaders());
  },
  async automationActions(): Promise<AvailableAction[]> {
    return await Automations.listAutomationActions(await authHeaders());
  },
  async automationTriggers(): Promise<AutomationTriggerInfo[]> {
    const { triggers } = await Automations.listAutomationTriggers(await authHeaders());
    return triggers;
  },
};
