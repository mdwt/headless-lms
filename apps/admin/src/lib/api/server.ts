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
 * Only SSR-prefetched **read** methods live here. Mutations and the browser-side
 * upload flow (presigned PUT straight to storage) stay client-side and are
 * never prefetched. Query serialization goes through the
 * shared `toQuery` so prefetch keys match client keys exactly (cache hit, no
 * refetch on first paint).
 */

import {
  Assets,
  Automations,
  Communities,
  Content,
  Discussion,
  Entitlements,
  Integrations,
  Organizations,
  Posts,
  Reporting,
} from "@headless-lms/sdk";

import { toQuery } from "./shared";
import { buildModuleTree, contentTypeOf, entitlementStatusOf } from "./compose";
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
  Community,
  CommunityMember,
  CommunityModeration,
  ContentType,
  Space,
  SpaceLinkRow,
  SpaceMember,
  Student,
  StudentAnalytics,
  Webhook,
} from "./types";

/** Title of one content item, read from the resource its type names. */
async function contentTitleOf(
  type: ContentType,
  id: string,
  headers: Awaited<ReturnType<typeof authHeaders>>,
): Promise<string> {
  if (type === "course") return (await Content.getCourse({ id }, headers)).title;
  if (type === "download") return (await Content.getDownload({ downloadId: id }, headers)).title;
  return (await Communities.getCommunity({ communityId: id }, headers)).title;
}

/** Resolve a granted content id to its type + display title. The grant row
 *  stores only the id; its prefix names the type, so one read gets the title. */
async function contentRefOf(
  contentId: string,
  headers: Awaited<ReturnType<typeof authHeaders>>,
): Promise<Entitlement["content"]> {
  const type = contentTypeOf(contentId);
  if (!type) return { id: contentId, type: "course", title: contentId };
  try {
    return { id: contentId, type, title: await contentTitleOf(type, contentId, headers) };
  } catch {
    return { id: contentId, type, title: contentId };
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

type Headers = Awaited<ReturnType<typeof authHeaders>>;

async function peopleById(
  ids: string[],
  headers: Headers,
): Promise<Map<string, { name: string; email: string }>> {
  const unique = [...new Set(ids)];
  const people = new Map<string, { name: string; email: string }>();
  if (unique.length === 0) return people;
  const team = await Organizations.listMembers({ pageSize: 100 }, headers);
  for (const m of team.rows) people.set(m.id, { name: fullName(m), email: m.email });
  const students = await Promise.all(
    unique
      .filter((id) => !people.has(id))
      .map(async (id) => {
        try {
          return await Organizations.getStudent({ id }, headers);
        } catch {
          return null;
        }
      }),
  );
  for (const s of students) if (s) people.set(s.id, { name: fullName(s), email: s.email });
  return people;
}

async function linkableTitles(
  headers: Headers,
): Promise<{ id: string; title: string; type: ContentType }[]> {
  const [courses, downloads, communities] = await Promise.all([
    Content.listCourses({ pageSize: 100, sort: "title" }, headers),
    Content.listDownloads({ pageSize: 100, sort: "title" }, headers),
    Communities.listCommunities({ pageSize: 100, sort: "title" }, headers),
  ]);
  return [
    ...courses.rows.map((c) => ({ id: c.id, title: c.title, type: "course" as const })),
    ...downloads.rows.map((d) => ({ id: d.id, title: d.title, type: "download" as const })),
    ...communities.rows.map((c) => ({ id: c.id, title: c.title, type: "community" as const })),
  ];
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
      | { id: string; title: string; type: ContentType }
      | { id: string; title: string; type: "bundle"; itemTitles: string[] }
    )[]
  > {
    const headers = await authHeaders();
    const [coursesPage, downloadsPage, communitiesPage, bundlesPage] = await Promise.all([
      Content.listCourses({ pageSize: 100, sort: "title" }, headers),
      Content.listDownloads({ pageSize: 100, sort: "title" }, headers),
      Communities.listCommunities({ pageSize: 100, sort: "title" }, headers),
      Content.listBundles({ pageSize: 100, sort: "name" }, headers),
    ]);
    const bundleItems = await Promise.all(
      bundlesPage.rows.map((b) => Content.listBundleItems({ bundleId: b.id }, headers)),
    );
    const titleById = new Map([
      ...coursesPage.rows.map((c) => [c.id, c.title] as const),
      ...downloadsPage.rows.map((d) => [d.id, d.title] as const),
      ...communitiesPage.rows.map((c) => [c.id, c.title] as const),
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
    const communities = communitiesPage.rows
      .map((c) => ({ id: c.id, title: c.title, type: "community" as const }))
      .sort(byTitle);
    return [...bundles, ...courses, ...downloads, ...communities];
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
    return await Content.listDownloadAssets({ downloadId }, await authHeaders());
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

  // communities
  async listCommunities(params: ListParams): Promise<Paginated<Community>> {
    return await Communities.listCommunities(toQuery(params, ["status"]), await authHeaders());
  },
  async getCommunity(communityId: string): Promise<Community> {
    return await Communities.getCommunity({ communityId }, await authHeaders());
  },
  async communitySpaces(communityId: string): Promise<Space[]> {
    return await Communities.listCommunitySpaces({ communityId }, await authHeaders());
  },
  async getSpace(communityId: string, spaceId: string): Promise<Space> {
    return await Communities.getSpace({ communityId, spaceId }, await authHeaders());
  },
  async communityMemberCount(communityId: string): Promise<number> {
    const page = await Communities.listCommunityMembers(
      { communityId, page: 1, pageSize: 1 },
      await authHeaders(),
    );
    return page.total;
  },
  async communityMembers(
    communityId: string,
    params: ListParams,
  ): Promise<Paginated<CommunityMember>> {
    return await Communities.listCommunityMembers(
      {
        communityId,
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
      },
      await authHeaders(),
    );
  },
  async communityMembersLite(
    communityId: string,
  ): Promise<{ id: string; name: string; email: string; role: CommunityMember["role"] }[]> {
    const page = await Communities.listCommunityMembers(
      { communityId, page: 1, pageSize: 100 },
      await authHeaders(),
    );
    return page.rows.map((m) => ({ id: m.id, name: fullName(m), email: m.email, role: m.role }));
  },
  async spaceMembers(communityId: string, spaceId: string): Promise<SpaceMember[]> {
    const headers = await authHeaders();
    const rows: Awaited<ReturnType<typeof Communities.listCommunitySpaceMembers>>["rows"] = [];
    for (let page = 1; ; page++) {
      const batch = await Communities.listCommunitySpaceMembers(
        { communityId, spaceId, page, pageSize: 100 },
        headers,
      );
      rows.push(...batch.rows);
      if (rows.length >= batch.total || batch.rows.length === 0) break;
    }
    const people = await peopleById(
      rows.map((r) => r.orgUserId),
      headers,
    );
    return rows.map((r) => ({
      ...r,
      name: people.get(r.orgUserId)?.name ?? "Unknown person",
      email: people.get(r.orgUserId)?.email ?? "",
    }));
  },
  async spaceLinks(space: Space): Promise<SpaceLinkRow[]> {
    const content = await linkableTitles(await authHeaders());
    const byId = new Map(content.map((c) => [c.id, c]));
    return space.links.map((link) => {
      const target = byId.get(link.contentId);
      return {
        ...link,
        type: target?.type ?? contentTypeOf(link.contentId) ?? "course",
        title: target?.title ?? link.contentId,
      };
    });
  },
  async linkableContent(): Promise<{ id: string; title: string; type: ContentType }[]> {
    return await linkableTitles(await authHeaders());
  },
  async communityModeration(communityId: string): Promise<CommunityModeration> {
    const headers = await authHeaders();
    const [spaces, messages] = await Promise.all([
      Communities.listCommunitySpaces({ communityId }, headers),
      Communities.getCommunityMessageQueue({ communityId }, headers),
    ]);
    const queues = await Promise.all(
      spaces.map((space) =>
        Communities.getCommunitySpaceQueue({ communityId, spaceId: space.id }, headers),
      ),
    );
    const flaggedPostIds = [...new Set(queues.flatMap((q) => q.flags.map((f) => f.postId)))];
    const [posts, people] = await Promise.all([
      Promise.all(
        flaggedPostIds.map(async (postId) => {
          try {
            return await Posts.getPost({ postId }, headers);
          } catch {
            return null;
          }
        }),
      ),
      peopleById(
        queues.flatMap((q) => q.commentFlags.map((f) => f.comment.orgUserId)),
        headers,
      ),
    ]);
    const postById = new Map(posts.filter((p) => p !== null).map((p) => [p.id, p]));
    return {
      spaces: spaces.map((space, i) => {
        const queue = queues[i];
        const flagsByPost = Map.groupBy(queue.flags, (f) => f.postId);
        const flagsByComment = Map.groupBy(queue.commentFlags, (f) => f.comment.id);
        return {
          space: { id: space.id, name: space.name },
          pending: queue.pending,
          flaggedPosts: [...flagsByPost].flatMap(([postId, flags]) => {
            const post = postById.get(postId);
            return post ? [{ post, flags }] : [];
          }),
          flaggedComments: [...flagsByComment].map(([, flags]) => ({
            comment: flags[0].comment,
            authorName: people.get(flags[0].comment.orgUserId)?.name ?? "Unknown person",
            flags,
          })),
        };
      }),
      messages: messages.entries,
    };
  },
  async communityAutomations(communityId: string): Promise<Automation[]> {
    const automations = await Automations.listAutomations(
      { kind: "workflow" },
      await authHeaders(),
    );
    return automations
      .filter((a) => a.filter?.communityId === communityId)
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  // media library (assets) — list only; uploads stay client-side
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
