// Shared list engine for the in-memory repositories: global search, sort
// (field, optionally `-` prefixed for descending) and pagination. Faceted
// filters are applied by the caller before handing rows here.

export interface ListQueryLike {
  page: number;
  pageSize: number;
  search?: string | undefined;
  sort?: string | undefined;
}

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function applyList<T extends object>(
  rows: T[],
  query: ListQueryLike,
  searchKeys: (keyof T)[],
): Paged<T> {
  let out = [...rows];

  const q = query.search?.trim().toLowerCase();
  if (q) {
    out = out.filter((row) =>
      searchKeys.some((k) => String(row[k] ?? "").toLowerCase().includes(q)),
    );
  }

  if (query.sort) {
    const desc = query.sort.startsWith("-");
    const key = (desc ? query.sort.slice(1) : query.sort) as keyof T;
    out.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      return desc ? -cmp : cmp;
    });
  }

  const total = out.length;
  const start = (query.page - 1) * query.pageSize;
  return {
    rows: out.slice(start, start + query.pageSize),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** Deterministic seed helpers (no Math.random / Date.now at import time). */
export const SEED_NOW = Date.parse("2026-06-28T12:00:00.000Z");
export const DAY_MS = 86_400_000;
export const daysAgo = (n: number): string => new Date(SEED_NOW - n * DAY_MS).toISOString();
export const daysAhead = (n: number): string => new Date(SEED_NOW + n * DAY_MS).toISOString();
