import "server-only";

/**
 * Server-side mirror of the browser `api` (`sdk.ts`), used by Server Components
 * to prefetch data for React-Query hydration.
 *
 * The SDK `client` is a module-level singleton with a global `credentials:
 * "include"`. On the server it is shared across all concurrent requests/users,
 * so mutating it to attach a per-request cookie would leak cookies between
 * users. Instead every call threads the incoming request's cookie via the
 * per-call `headers` option — never `client.setConfig` with request state.
 * `configureSdk` only sets the (constant) baseUrl.
 *
 * Only SSR-prefetched **read** methods live here. Mutations and browser-only
 * flows (`uploadAsset`, presigned `assetDownloadUrl`, `useAssetUrl`) stay
 * client-side and are never prefetched. Query serialization reuses the same
 * `toQuery`/`unwrap` as the browser client so prefetch keys match client keys
 * exactly (cache hit, no refetch on first paint).
 */

import {
  Assets,
  ConnectedApps,
  Courses,
  Dashboard,
  Entitlements,
  Integrations,
  Organizations,
  Students,
} from "@headless-lms/sdk";

import { toQuery, unwrap } from "./shared";
import { ensureConfigured, authHeaders } from "./server-call";
import type {
  Asset,
  AvailableIntegration,
  ConnectedApp,
  Course,
  Entitlement,
  IntegrationConnection,
  ListParams,
  Member,
  Module,
  OverviewStats,
  Paginated,
  Student,
} from "./types";


export const serverApi = {
  // dashboard
  async overview(): Promise<OverviewStats> {
    ensureConfigured();
    return unwrap(await Dashboard.getOverview(await authHeaders()));
  },

  // courses
  async listCourses(params: ListParams): Promise<Paginated<Course>> {
    ensureConfigured();
    return unwrap(
      await Courses.listCourses({
        query: toQuery(params, ["status", "category"]),
        ...(await authHeaders()),
      }),
    );
  },
  async getCourse(id: string): Promise<Course> {
    ensureConfigured();
    return unwrap(await Courses.getCourse({ path: { id }, ...(await authHeaders()) }));
  },
  async listModules(courseId: string): Promise<Module[]> {
    ensureConfigured();
    return unwrap(
      await Courses.listModules({ path: { courseId }, ...(await authHeaders()) }),
    );
  },
  async coursesLite(): Promise<{ id: string; title: string }[]> {
    ensureConfigured();
    const page = unwrap(
      await Courses.listCourses({ query: { pageSize: 100, sort: "title" }, ...(await authHeaders()) }),
    );
    return page.rows.map((c) => ({ id: c.id, title: c.title }));
  },

  // students
  async listStudents(params: ListParams): Promise<Paginated<Student>> {
    ensureConfigured();
    return unwrap(
      await Students.listStudents({ query: toQuery(params, []), ...(await authHeaders()) }),
    );
  },
  async getStudent(id: string): Promise<Student> {
    ensureConfigured();
    return unwrap(await Students.getStudent({ path: { id }, ...(await authHeaders()) }));
  },
  async studentEntitlements(studentId: string): Promise<Entitlement[]> {
    ensureConfigured();
    const page = unwrap(
      await Entitlements.listEntitlements({
        query: { studentId, pageSize: 100 },
        ...(await authHeaders()),
      }),
    );
    return page.rows;
  },
  async studentsLite(search?: string): Promise<{ id: string; name: string; email: string }[]> {
    ensureConfigured();
    const page = unwrap(
      await Students.listStudents({
        query: { pageSize: 100, search: search || undefined, sort: "name" },
        ...(await authHeaders()),
      }),
    );
    return page.rows.map((s) => ({ id: s.id, name: s.name, email: s.email }));
  },

  // entitlements
  async listEntitlements(params: ListParams): Promise<Paginated<Entitlement>> {
    ensureConfigured();
    return unwrap(
      await Entitlements.listEntitlements({
        query: toQuery(params, ["status", "source"]),
        ...(await authHeaders()),
      }),
    );
  },
  async courseEntitlements(courseId: string): Promise<Entitlement[]> {
    ensureConfigured();
    const page = unwrap(
      await Entitlements.listEntitlements({
        query: { contentId: courseId, pageSize: 100 },
        ...(await authHeaders()),
      }),
    );
    return page.rows;
  },

  // members
  async listMembers(params: ListParams): Promise<Paginated<Member>> {
    ensureConfigured();
    return unwrap(
      await Organizations.listMembers({
        query: toQuery(params, ["role", "status"]),
        ...(await authHeaders()),
      }),
    );
  },
  async instructorsLite(): Promise<{ id: string; name: string }[]> {
    ensureConfigured();
    const page = unwrap(
      await Organizations.listMembers({ query: { pageSize: 100 }, ...(await authHeaders()) }),
    );
    return page.rows
      .filter((m) => m.role === "owner" || m.role === "admin" || m.role === "instructor")
      .map((m) => ({ id: m.id, name: m.name }));
  },

  // media library (assets) — list only; presigned URL/upload stay client-side
  async listAssets(params: ListParams): Promise<Paginated<Asset>> {
    ensureConfigured();
    return unwrap(
      await Assets.listAssets({ query: toQuery(params, ["kind"]), ...(await authHeaders()) }),
    );
  },

  // connected apps
  async listConnectedApps(): Promise<ConnectedApp[]> {
    ensureConfigured();
    return unwrap(await ConnectedApps.listConnectedApps(await authHeaders()));
  },

  // integrations
  async listAvailableIntegrations(): Promise<AvailableIntegration[]> {
    ensureConfigured();
    return unwrap(await Integrations.listAvailableIntegrations(await authHeaders()));
  },
  async listConnections(): Promise<IntegrationConnection[]> {
    ensureConfigured();
    return unwrap(await Integrations.listConnections(await authHeaders()));
  },
};
