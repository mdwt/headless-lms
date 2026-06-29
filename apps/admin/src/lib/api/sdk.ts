/**
 * The typed API client — bound to the generated SDK (`@headless-lms/sdk`),
 * which is generated from the API contract package. This replaces the former
 * in-app mock entirely: every call is a real, end-to-end-typed request to the
 * API, carrying the better-auth session cookie (credentials: "include").
 *
 * Hooks and components consume this `api` object; its method signatures are the
 * stable seam, so the rest of the app is unaffected by SDK changes.
 */
import {
  Assets,
  ConnectedApps,
  Courses,
  Dashboard,
  Entitlements,
  Organizations,
  Students,
  configureSdk,
} from "@headless-lms/sdk";

import { ApiError } from "./http";
import type {
  Asset,
  AssetKind,
  ConnectedApp,
  Course,
  DownloadTicket,
  Entitlement,
  ListParams,
  Member,
  Module,
  ModuleItem,
  OverviewStats,
  Paginated,
  Role,
  Student,
} from "./types";

let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  configureSdk({ baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000" });
  configured = true;
}

interface SdkResult<T> {
  data?: T | undefined;
  error?: unknown;
  response?: Response | undefined;
}

function unwrap<T>(result: SdkResult<T>): T {
  if (result.error !== undefined || result.data === undefined) {
    const status = result.response?.status ?? 500;
    const message =
      (result.error as { message?: string } | undefined)?.message ??
      result.response?.statusText ??
      "Request failed";
    throw new ApiError(status, message);
  }
  return result.data;
}

function expectOk(result: SdkResult<unknown>): void {
  if (result.error !== undefined) {
    throw new ApiError(result.response?.status ?? 500, "Request failed");
  }
}

/**
 * Map the dashboard table's params onto the SDK's typed query.
 *
 * Two intentional narrowings vs. the table's capabilities (see the gap notes):
 * the API takes a single `sort` field (`-field` for desc), so only the primary
 * sort column is sent; and faceted filters are single-valued server-side, so
 * the first selected value per facet is applied.
 */
function toQuery(params: ListParams, facetKeys: readonly string[]): Record<string, unknown> {
  const sort = params.sort?.[0];
  const q: Record<string, unknown> = {
    page: params.page,
    pageSize: params.pageSize,
    search: params.search || undefined,
    sort: sort ? `${sort.desc ? "-" : ""}${sort.id}` : undefined,
  };
  for (const key of facetKeys) {
    const values = params.filters?.[key];
    if (values?.length) q[key] = values[0];
  }
  return q;
}

export const api = {
  // dashboard
  async overview(): Promise<OverviewStats> {
    ensureConfigured();
    return unwrap(await Dashboard.getOverview());
  },

  // courses
  async listCourses(params: ListParams): Promise<Paginated<Course>> {
    ensureConfigured();
    return unwrap(await Courses.listCourses({ query: toQuery(params, ["status", "category"]) }));
  },
  async getCourse(id: string): Promise<Course> {
    ensureConfigured();
    return unwrap(await Courses.getCourse({ path: { id } }));
  },
  async createCourse(input: Partial<Course>): Promise<Course> {
    ensureConfigured();
    return unwrap(
      await Courses.createCourse({
        body: {
          title: input.title ?? "Untitled course",
          description: input.description,
          category: input.category,
          instructorId: input.instructorId,
        },
      }),
    );
  },
  async updateCourse(id: string, patch: Partial<Course>): Promise<Course> {
    ensureConfigured();
    return unwrap(
      await Courses.updateCourse({
        path: { id },
        body: {
          title: patch.title,
          description: patch.description,
          category: patch.category,
          instructorId: patch.instructorId,
          status: patch.status,
        },
      }),
    );
  },
  async deleteCourse(id: string): Promise<void> {
    ensureConfigured();
    expectOk(await Courses.deleteCourse({ path: { id } }));
  },

  // modules + items (write endpoints return the full, reordered module list)
  async listModules(courseId: string): Promise<Module[]> {
    ensureConfigured();
    return unwrap(await Courses.listModules({ path: { courseId } }));
  },
  async reorderModules(courseId: string, orderedIds: string[]): Promise<Module[]> {
    ensureConfigured();
    return unwrap(await Courses.reorderModules({ path: { courseId }, body: { orderedIds } }));
  },
  async reorderItems(courseId: string, moduleId: string, orderedIds: string[]): Promise<Module[]> {
    ensureConfigured();
    return unwrap(
      await Courses.reorderItems({ path: { courseId, moduleId }, body: { orderedIds } }),
    );
  },
  async createModule(courseId: string, title: string): Promise<Module[]> {
    ensureConfigured();
    return unwrap(await Courses.createModule({ path: { courseId }, body: { title } }));
  },
  async updateModule(courseId: string, moduleId: string, title: string): Promise<Module[]> {
    ensureConfigured();
    return unwrap(await Courses.updateModule({ path: { courseId, moduleId }, body: { title } }));
  },
  async deleteModule(courseId: string, moduleId: string): Promise<Module[]> {
    ensureConfigured();
    return unwrap(await Courses.deleteModule({ path: { courseId, moduleId } }));
  },
  async saveItem(
    courseId: string,
    moduleId: string,
    item: Partial<ModuleItem> & { id?: string },
  ): Promise<Module[]> {
    ensureConfigured();
    // Build the discriminated SaveItem body from the form payload.
    const body =
      item.kind === "assessment"
        ? {
            kind: "assessment" as const,
            title: item.title ?? "New assessment",
            type: (item as { type?: "quiz" | "assignment" }).type ?? "quiz",
            questionCount: (item as { questionCount?: number }).questionCount,
            pointsPossible: (item as { pointsPossible?: number }).pointsPossible,
            published: item.published,
          }
        : {
            kind: "lesson" as const,
            title: item.title ?? "New lesson",
            type:
              (item as { type?: "video" | "text" | "pdf" | "audio" | "download" | "embed" }).type ??
              "video",
            durationLabel: (item as { durationLabel?: string }).durationLabel,
            published: item.published,
          };
    if (item.id) {
      return unwrap(
        await Courses.updateItem({ path: { courseId, moduleId, itemId: item.id }, body }),
      );
    }
    return unwrap(await Courses.createItem({ path: { courseId, moduleId }, body }));
  },
  async deleteItem(courseId: string, moduleId: string, itemId: string): Promise<Module[]> {
    ensureConfigured();
    return unwrap(await Courses.deleteItem({ path: { courseId, moduleId, itemId } }));
  },

  // students
  async listStudents(params: ListParams): Promise<Paginated<Student>> {
    ensureConfigured();
    return unwrap(await Students.listStudents({ query: toQuery(params, []) }));
  },
  async getStudent(id: string): Promise<Student> {
    ensureConfigured();
    return unwrap(await Students.getStudent({ path: { id } }));
  },
  async studentEntitlements(studentId: string): Promise<Entitlement[]> {
    ensureConfigured();
    const page = unwrap(
      await Entitlements.listEntitlements({ query: { studentId, pageSize: 100 } }),
    );
    return page.rows;
  },

  // entitlements
  async listEntitlements(params: ListParams): Promise<Paginated<Entitlement>> {
    ensureConfigured();
    return unwrap(
      await Entitlements.listEntitlements({ query: toQuery(params, ["status", "source"]) }),
    );
  },
  async grantEntitlement(input: {
    studentId: string;
    courseId: string;
    expiresAt: string | null;
  }): Promise<Entitlement> {
    ensureConfigured();
    return unwrap(await Entitlements.grantEntitlement({ body: input }));
  },
  async revokeEntitlement(id: string): Promise<Entitlement> {
    ensureConfigured();
    return unwrap(await Entitlements.setEntitlementStatus({ path: { id }, body: { status: "revoked" } }));
  },
  async reinstateEntitlement(id: string): Promise<Entitlement> {
    ensureConfigured();
    return unwrap(await Entitlements.setEntitlementStatus({ path: { id }, body: { status: "active" } }));
  },

  // members
  async listMembers(params: ListParams): Promise<Paginated<Member>> {
    ensureConfigured();
    return unwrap(await Organizations.listMembers({ query: toQuery(params, ["role", "status"]) }));
  },
  async inviteMember(input: { email: string; role: Role }): Promise<Member> {
    ensureConfigured();
    return unwrap(await Organizations.inviteMember({ body: input }));
  },
  async updateMemberRole(id: string, role: Role): Promise<Member> {
    ensureConfigured();
    return unwrap(await Organizations.updateMemberRole({ path: { id }, body: { role } }));
  },
  async removeMember(id: string): Promise<void> {
    ensureConfigured();
    expectOk(await Organizations.removeMember({ path: { id } }));
  },

  // media library (assets)
  async listAssets(params: ListParams): Promise<Paginated<Asset>> {
    ensureConfigured();
    return unwrap(await Assets.listAssets({ query: toQuery(params, ["kind"]) }));
  },
  async assetDownloadUrl(id: string, filename?: string): Promise<DownloadTicket> {
    ensureConfigured();
    return unwrap(await Assets.requestAssetDownload({ path: { id }, body: { filename } }));
  },
  async deleteAsset(id: string): Promise<void> {
    ensureConfigured();
    expectOk(await Assets.deleteAsset({ path: { id } }));
  },
  /**
   * Best-practice presigned upload, all in one call:
   *  1. register the asset + get a presigned PUT URL,
   *  2. PUT the bytes straight to object storage (not through the API),
   *  3. confirm so the API captures the final size/content-type.
   */
  async uploadAsset(file: File, onProgress?: (fraction: number) => void): Promise<Asset> {
    ensureConfigured();
    const contentType = file.type || "application/octet-stream";
    const ticket = unwrap(
      await Assets.requestUpload({
        body: { filename: file.name, contentType, kind: kindForFile(file) },
      }),
    );

    await putToStorage(ticket.uploadUrl, ticket.headers ?? {}, file, onProgress);

    return unwrap(await Assets.confirmAsset({ path: { id: ticket.asset.id } }));
  },

  // connected apps (OAuth tokens the current user has issued)
  async listConnectedApps(): Promise<ConnectedApp[]> {
    ensureConfigured();
    return unwrap(await ConnectedApps.listConnectedApps());
  },
  async revokeConnectedApp(id: string): Promise<void> {
    ensureConfigured();
    expectOk(await ConnectedApps.revokeConnectedApp({ path: { id } }));
  },

  // option sources for selects (derived from the list endpoints)
  async coursesLite(): Promise<{ id: string; title: string }[]> {
    ensureConfigured();
    const page = unwrap(await Courses.listCourses({ query: { pageSize: 100, sort: "title" } }));
    return page.rows.map((c) => ({ id: c.id, title: c.title }));
  },
  async studentsLite(search?: string): Promise<{ id: string; name: string; email: string }[]> {
    ensureConfigured();
    const page = unwrap(
      await Students.listStudents({ query: { pageSize: 100, search: search || undefined, sort: "name" } }),
    );
    return page.rows.map((s) => ({ id: s.id, name: s.name, email: s.email }));
  },
  async instructorsLite(): Promise<{ id: string; name: string }[]> {
    ensureConfigured();
    const page = unwrap(await Organizations.listMembers({ query: { pageSize: 100 } }));
    return page.rows
      .filter((m) => m.role === "owner" || m.role === "admin" || m.role === "instructor")
      .map((m) => ({ id: m.id, name: m.name }));
  },
};

/** Map a browser File to the API's coarse asset kind. */
export function kindForFile(file: File): AssetKind {
  if (file.type.startsWith("image/")) return "content";
  if (file.type.startsWith("video/")) return "video";
  return "download";
}

/** True when an asset can be shown as an inline thumbnail/preview. */
export function isPreviewable(asset: Pick<Asset, "kind" | "contentType">): boolean {
  return asset.contentType.startsWith("image/") || asset.contentType.startsWith("video/");
}

/**
 * PUT the file straight to object storage using the presigned URL + headers
 * from the upload ticket. Uses XHR so the caller can show real upload progress.
 */
function putToStorage(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new ApiError(xhr.status, "Upload to storage failed"));
    };
    xhr.onerror = () =>
      reject(new ApiError(0, "Couldn't reach storage (check the bucket's CORS configuration)"));
    xhr.send(file);
  });
}

/** Role + scope of the caller. The API derives org/role from the session
 *  cookie, so list endpoints no longer need it; kept for callers that still
 *  reference the type. */
export interface Caller {
  role: Role;
  scopedCourseIds: string[];
}
