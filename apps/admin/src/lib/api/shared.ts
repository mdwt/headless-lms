/**
 * Isomorphic API helpers shared by the browser client (`sdk.ts`) and the
 * server client (`server.ts`). Keeping `unwrap`/`expectOk`/`toQuery` in one
 * place guarantees the browser and the SSR prefetch serialize queries and
 * surface errors **identically** — critical because a divergent `toQuery`
 * would make the client's query key miss the server-hydrated cache and refetch.
 */

import { ApiError } from "./http";
import type { ListParams } from "./types";

export { ApiError };

/** The `{ data, error, response }` envelope every generated SDK call returns. */
export interface SdkResult<T> {
  data?: T | undefined;
  error?: unknown;
  response?: Response | undefined;
}

/** Unwrap an SDK result to its data, or throw a typed `ApiError` on failure. */
export function unwrap<T>(result: SdkResult<T>): T {
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

/** Assert a no-body SDK call succeeded (delete/void endpoints). */
export function expectOk(result: SdkResult<unknown>): void {
  if (result.error !== undefined) {
    throw new ApiError(result.response?.status ?? 500, "Request failed");
  }
}

/**
 * Map the dashboard table's params onto the SDK's typed query.
 *
 * Two intentional narrowings vs. the table's capabilities: the API takes a
 * single `sort` field (`-field` for desc), so only the primary sort column is
 * sent; and faceted filters are single-valued server-side, so the first
 * selected value per facet is applied.
 */
export function toQuery(
  params: ListParams,
  facetKeys: readonly string[],
): Record<string, unknown> {
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
