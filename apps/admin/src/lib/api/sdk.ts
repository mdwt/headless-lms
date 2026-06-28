/**
 * Courses bound to the generated, resource-based SDK (`@headless-lms/sdk`).
 *
 * The SDK is generated off the OpenAPI spec the API emits from its Zod route
 * schemas (`pnpm gen:sdk`), so these calls are end-to-end typed. To go live,
 * point `client.ts`'s courses methods at `coursesApi` below — the signatures
 * match, so no hook or component changes are needed. Other resources stay on
 * the mock until their backend routes exist.
 */
import { Courses, configureSdk, type ListCoursesData } from "@headless-lms/sdk";
import { ApiError } from "./http";
import type { Course, ListParams, Paginated } from "./types";

let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  configureSdk({ baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000" });
  configured = true;
}

/** Map the dashboard's table params onto the SDK's typed query. */
function toQuery(params: ListParams): ListCoursesData["query"] {
  const sort = params.sort?.[0];
  return {
    page: params.page,
    pageSize: params.pageSize,
    search: params.search || undefined,
    sort: sort ? `${sort.desc ? "-" : ""}${sort.id}` : undefined,
    status: params.filters?.status?.[0] as "draft" | "published" | undefined,
    category: params.filters?.category?.[0],
  };
}

interface SdkResult<T> {
  data?: T | undefined;
  error?: unknown;
  response?: Response | undefined;
}

function unwrap<T>(result: SdkResult<T>): T {
  if (result.error !== undefined || result.data === undefined) {
    throw new ApiError(result.response?.status ?? 500, "Request failed");
  }
  return result.data;
}

export const coursesApi = {
  async list(params: ListParams): Promise<Paginated<Course>> {
    ensureConfigured();
    return unwrap(await Courses.listCourses({ query: toQuery(params) })) as Paginated<Course>;
  },

  async get(id: string): Promise<Course> {
    ensureConfigured();
    return unwrap(await Courses.getCourse({ path: { id } })) as Course;
  },

  async create(input: Partial<Course>): Promise<Course> {
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
    ) as Course;
  },

  async update(id: string, patch: Partial<Course>): Promise<Course> {
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
    ) as Course;
  },

  async remove(id: string): Promise<void> {
    ensureConfigured();
    const res = await Courses.deleteCourse({ path: { id } });
    if (res.error !== undefined) throw new ApiError(res.response?.status ?? 500, "Request failed");
  },
};
