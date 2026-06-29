/**
 * TanStack Query keys, organized by domain. Mutations invalidate by domain
 * root (e.g. `qk.courses.all`) so lists, detail, and counts stay coherent.
 */

import type { ListParams } from "./api/types";

export const qk = {
  overview: ["overview"] as const,

  courses: {
    all: ["courses"] as const,
    list: (params: ListParams, scope: string) => ["courses", "list", scope, params] as const,
    detail: (id: string) => ["courses", "detail", id] as const,
    modules: (id: string) => ["courses", id, "modules"] as const,
    lite: ["courses", "lite"] as const,
  },

  students: {
    all: ["students"] as const,
    list: (params: ListParams) => ["students", "list", params] as const,
    detail: (id: string) => ["students", "detail", id] as const,
    enrollments: (id: string) => ["students", id, "enrollments"] as const,
    lite: ["students", "lite"] as const,
  },

  enrollments: {
    all: ["enrollments"] as const,
    list: (params: ListParams) => ["enrollments", "list", params] as const,
  },

  members: {
    all: ["members"] as const,
    list: (params: ListParams) => ["members", "list", params] as const,
  },

  instructors: { lite: ["instructors", "lite"] as const },

  assets: {
    all: ["assets"] as const,
    list: (params: ListParams) => ["assets", "list", params] as const,
    url: (id: string) => ["assets", id, "url"] as const,
  },
};
