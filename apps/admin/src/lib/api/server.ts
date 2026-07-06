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

import { cookies } from "next/headers";
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

import { toQuery, unwrap } from "./shared";
import type {
  Asset,
  ConnectedApp,
  Course,
  Entitlement,
  ListParams,
  Member,
  Module,
  OverviewStats,
  Paginated,
  Student,
} from "./types";

const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  // baseUrl only — the cookie is passed per-call, never on the shared client.
  configureSdk({ baseUrl: API_URL });
  configured = true;
}

/** Per-call header bag that forwards the incoming request's raw cookie. */
async function cookieHeader(): Promise<{ headers: { cookie: string } }> {
  const cookie = (await cookies()).toString();
  return { headers: { cookie } };
}

export const serverApi = {
  // dashboard
  async overview(): Promise<OverviewStats> {
    ensureConfigured();
    return unwrap(await Dashboard.getOverview(await cookieHeader()));
  },

  // courses
  async listCourses(params: ListParams): Promise<Paginated<Course>> {
    ensureConfigured();
    return unwrap(
      await Courses.listCourses({
        query: toQuery(params, ["status", "category"]),
        ...(await cookieHeader()),
      }),
    );
  },
  async getCourse(id: string): Promise<Course> {
    ensureConfigured();
    return unwrap(await Courses.getCourse({ path: { id }, ...(await cookieHeader()) }));
  },
  async listModules(courseId: string): Promise<Module[]> {
    ensureConfigured();
    return unwrap(
      await Courses.listModules({ path: { courseId }, ...(await cookieHeader()) }),
    );
  },
  async coursesLite(): Promise<{ id: string; title: string }[]> {
    ensureConfigured();
    const page = unwrap(
      await Courses.listCourses({ query: { pageSize: 100, sort: "title" }, ...(await cookieHeader()) }),
    );
    return page.rows.map((c) => ({ id: c.id, title: c.title }));
  },

  // students
  async listStudents(params: ListParams): Promise<Paginated<Student>> {
    ensureConfigured();
    return unwrap(
      await Students.listStudents({ query: toQuery(params, []), ...(await cookieHeader()) }),
    );
  },
  async getStudent(id: string): Promise<Student> {
    ensureConfigured();
    return unwrap(await Students.getStudent({ path: { id }, ...(await cookieHeader()) }));
  },
  async studentEntitlements(studentId: string): Promise<Entitlement[]> {
    ensureConfigured();
    const page = unwrap(
      await Entitlements.listEntitlements({
        query: { studentId, pageSize: 100 },
        ...(await cookieHeader()),
      }),
    );
    return page.rows;
  },
  async studentsLite(search?: string): Promise<{ id: string; name: string; email: string }[]> {
    ensureConfigured();
    const page = unwrap(
      await Students.listStudents({
        query: { pageSize: 100, search: search || undefined, sort: "name" },
        ...(await cookieHeader()),
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
        ...(await cookieHeader()),
      }),
    );
  },

  // members
  async listMembers(params: ListParams): Promise<Paginated<Member>> {
    ensureConfigured();
    return unwrap(
      await Organizations.listMembers({
        query: toQuery(params, ["role", "status"]),
        ...(await cookieHeader()),
      }),
    );
  },
  async instructorsLite(): Promise<{ id: string; name: string }[]> {
    ensureConfigured();
    const page = unwrap(
      await Organizations.listMembers({ query: { pageSize: 100 }, ...(await cookieHeader()) }),
    );
    return page.rows
      .filter((m) => m.role === "owner" || m.role === "admin" || m.role === "instructor")
      .map((m) => ({ id: m.id, name: m.name }));
  },

  // media library (assets) — list only; presigned URL/upload stay client-side
  async listAssets(params: ListParams): Promise<Paginated<Asset>> {
    ensureConfigured();
    return unwrap(
      await Assets.listAssets({ query: toQuery(params, ["kind"]), ...(await cookieHeader()) }),
    );
  },

  // connected apps
  async listConnectedApps(): Promise<ConnectedApp[]> {
    ensureConfigured();
    return unwrap(await ConnectedApps.listConnectedApps(await cookieHeader()));
  },
};
