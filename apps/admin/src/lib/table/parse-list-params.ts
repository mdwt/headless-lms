/**
 * Isomorphic list-params parser — the single source of truth for turning a URL
 * query string into the `ListParams` the API query needs. Used by BOTH the
 * Server Component (to build the prefetch key/params) and the client
 * `useDataTable` hook (to seed initial state), so the server-prefetched query
 * key and the client query key are byte-identical → the first client render
 * hits the hydrated cache with no refetch.
 *
 * URL schema:
 *  - `page`         → integer (absent means 1)
 *  - `pageSize`     → integer (absent means the caller's default)
 *  - `q`            → search string (absent means none)
 *  - `sort`         → comma list of `field` / `-field` tokens (`-` = desc)
 *  - `f_<columnId>` → faceted filter values, repeated and/or comma-separated
 *
 * Column visibility is intentionally NOT part of the URL (it's a per-user
 * preference, not a query input) and is stored in localStorage by the hook.
 */

import type { SortingState } from "@tanstack/react-table";
import type { ListParams } from "@/lib/api/types";

/** Prefix marking a faceted-filter query param, e.g. `f_status`. */
export const FILTER_PREFIX = "f_";

export interface ListParamsDefaults {
  /** Default page size when `pageSize` is absent from the URL. */
  pageSize: number;
  /** Default sort when `sort` is absent from the URL. */
  initialSort?: SortingState;
}

/**
 * Accepts either a `URLSearchParams`/`ReadonlyURLSearchParams` (client,
 * `useSearchParams()`) or a Server Component's awaited `searchParams` record.
 */
export type SearchParamsInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

interface Getters {
  get: (key: string) => string | null;
  getAll: (key: string) => string[];
  keys: () => string[];
}

function makeGetters(input: SearchParamsInput): Getters {
  if (typeof (input as URLSearchParams).getAll === "function") {
    const usp = input as URLSearchParams;
    return {
      get: (k) => usp.get(k),
      getAll: (k) => usp.getAll(k),
      keys: () => Array.from(usp.keys()),
    };
  }
  const rec = input as Record<string, string | string[] | undefined>;
  return {
    get: (k) => {
      const v = rec[k];
      return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
    },
    getAll: (k) => {
      const v = rec[k];
      return v == null ? [] : Array.isArray(v) ? v : [v];
    },
    keys: () => Object.keys(rec),
  };
}

function toInt(value: string | null, fallback: number): number {
  if (value == null) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Parse a `sort` token list (`-field,other`) into a `SortingState`. */
export function parseSort(raw: string): SortingState {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("-") ? { id: t.slice(1), desc: true } : { id: t, desc: false }));
}

/** Serialize a `SortingState` back to the `sort` token list, or null when empty. */
export function serializeSort(sorting: SortingState): string | null {
  if (!sorting.length) return null;
  return sorting.map((s) => (s.desc ? `-${s.id}` : s.id)).join(",");
}

/** The isomorphic parser: `searchParams` (+ defaults) → `ListParams`. */
export function parseListParams(
  input: SearchParamsInput,
  defaults: ListParamsDefaults,
): ListParams {
  const g = makeGetters(input);

  const page = toInt(g.get("page"), 1);
  const pageSize = toInt(g.get("pageSize"), defaults.pageSize);
  const search = g.get("q") || undefined;

  const sortRaw = g.get("sort");
  const sort = sortRaw ? parseSort(sortRaw) : (defaults.initialSort ?? []);

  const filters: Record<string, string[]> = {};
  for (const key of g.keys()) {
    if (!key.startsWith(FILTER_PREFIX)) continue;
    const columnId = key.slice(FILTER_PREFIX.length);
    const values = g
      .getAll(key)
      .flatMap((v) => v.split(","))
      .map((v) => v.trim())
      .filter(Boolean);
    if (values.length) filters[columnId] = values;
  }

  return { page, pageSize, search, sort, filters };
}
