"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  ColumnFiltersState,
  SortingState,
  Updater,
  VisibilityState,
} from "@tanstack/react-table";

import type { ListParams } from "@/lib/api/types";
import {
  FILTER_PREFIX,
  parseListParams,
  serializeSort,
} from "@/lib/table/parse-list-params";

/**
 * URL-backed table state. All server-affecting state (page, pageSize, search,
 * sort, faceted filters) lives in the URL `searchParams`, so the Server
 * Component renders exactly the page the URL asks for and deep links / reloads
 * are correct and SSR'd. Derivation goes through the SAME `parseListParams` the
 * server uses, so the client's query key matches the server prefetch key.
 *
 * The returned `DataTableState` shape (params + the 7 value/setter pairs) is
 * unchanged, so `DataTable` and its sub-components need zero changes.
 *
 * Contract preserved from the old hook:
 *  - functional-updater-safe setters (TanStack passes `Updater<T>`), resolved
 *    against current URL-derived state before serializing;
 *  - filter/search/sort/pageSize changes atomically reset `page` to 1 in the
 *    same URL write (replaces the old `resetKey` effect);
 *  - search is debounced (250ms) so typing doesn't spam history or refetch;
 *  - column visibility is a per-user preference kept in localStorage, not URL.
 */
export function useDataTable(opts?: { pageSize?: number; initialSort?: SortingState }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Defaults are static per call site. `initialSort` is typically an inline
  // array, so key it by its JSON to keep the params memo stable across renders.
  const pageSizeDefault = opts?.pageSize ?? 10;
  const initialSortKey = JSON.stringify(opts?.initialSort ?? []);

  const params: ListParams = React.useMemo(
    () =>
      parseListParams(searchParams, {
        pageSize: pageSizeDefault,
        initialSort: JSON.parse(initialSortKey) as SortingState,
      }),
    [searchParams, pageSizeDefault, initialSortKey],
  );

  const filters = React.useMemo(() => params.filters ?? {}, [params.filters]);
  const sorting = React.useMemo<SortingState>(() => params.sort ?? [], [params.sort]);
  const committedSearch = params.search ?? "";

  const columnFilters: ColumnFiltersState = React.useMemo(
    () => Object.entries(filters).map(([id, value]) => ({ id, value })),
    [filters],
  );

  /**
   * Atomically write a set of query params. `null` deletes; arrays are appended
   * as repeated params; strings are set. Rebuilt from the current `searchParams`
   * (so it always sees the freshest URL) and pushed with `router.replace` (no
   * history spam) without scrolling.
   */
  const writeUrl = React.useCallback(
    (patch: Record<string, string | string[] | null>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        sp.delete(key);
        if (value == null) continue;
        if (Array.isArray(value)) for (const v of value) sp.append(key, v);
        else sp.set(key, value);
      }
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // --- pagination ----------------------------------------------------------
  const setPage = React.useCallback(
    (p: number) => writeUrl({ page: p <= 1 ? null : String(p) }),
    [writeUrl],
  );
  const setPageSize = React.useCallback(
    (s: number) =>
      writeUrl({ pageSize: s === pageSizeDefault ? null : String(s), page: null }),
    [writeUrl, pageSizeDefault],
  );

  // --- sorting (functional-updater-safe; sort change resets page) ----------
  const setSorting = React.useCallback(
    (updater: Updater<SortingState>) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      writeUrl({ sort: serializeSort(next), page: null });
    },
    [sorting, writeUrl],
  );

  // --- faceted filters (functional-updater-safe; filter change resets page) --
  const setColumnFilters = React.useCallback(
    (updater: Updater<ColumnFiltersState>) => {
      const next = typeof updater === "function" ? updater(columnFilters) : updater;
      const patch: Record<string, string | string[] | null> = {};
      // Clear every facet key currently in the URL…
      for (const id of Object.keys(filters)) patch[`${FILTER_PREFIX}${id}`] = null;
      // …then set the new selection.
      for (const f of next) {
        if (Array.isArray(f.value) && f.value.length) {
          patch[`${FILTER_PREFIX}${f.id}`] = f.value as string[];
        }
      }
      patch.page = null;
      writeUrl(patch);
    },
    [columnFilters, filters, writeUrl],
  );

  // --- search: local input for responsiveness, debounced push to URL -------
  const [search, setSearch] = React.useState(committedSearch);
  // Adjust-during-render sync: when the committed (URL) value changes externally
  // (back/forward, reset), re-seed the local input. This is React's documented
  // "adjust state when a prop changes" pattern — no effect, no cascading render.
  const [prevCommitted, setPrevCommitted] = React.useState(committedSearch);
  if (committedSearch !== prevCommitted) {
    setPrevCommitted(committedSearch);
    setSearch(committedSearch);
  }
  // Debounce the local input to the URL 250ms after it settles (search change
  // resets page). Skips when already committed to avoid a write loop.
  React.useEffect(() => {
    if (search === committedSearch) return;
    const t = setTimeout(() => writeUrl({ q: search || null, page: null }), 250);
    return () => clearTimeout(t);
  }, [search, committedSearch, writeUrl]);

  // --- column visibility: per-user preference in localStorage (not URL) ----
  const visKey = `dt:vis:${pathname}`;
  const [columnVisibility, setColumnVisibilityState] = React.useState<VisibilityState>({});

  // Load the stored preference on the client, after hydration. SSR + the first
  // client render use `{}` (all columns visible) so the markup matches; the
  // stored visibility is applied immediately after mount. Reading a client-only
  // external store here is the intended use of an effect.
  React.useEffect(() => {
    let stored: VisibilityState = {};
    try {
      const raw = window.localStorage.getItem(visKey);
      if (raw) stored = JSON.parse(raw) as VisibilityState;
    } catch {
      stored = {};
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from localStorage post-hydration
    setColumnVisibilityState(stored);
  }, [visKey]);

  const setColumnVisibility = React.useCallback(
    (updater: Updater<VisibilityState>) => {
      setColumnVisibilityState((old) => {
        const next = typeof updater === "function" ? updater(old) : updater;
        try {
          window.localStorage.setItem(visKey, JSON.stringify(next));
        } catch {
          /* ignore quota/availability errors */
        }
        return next;
      });
    },
    [visKey],
  );

  return {
    params,
    page: params.page,
    setPage,
    pageSize: params.pageSize,
    setPageSize,
    sorting,
    setSorting,
    search,
    setSearch,
    columnFilters,
    setColumnFilters,
    columnVisibility,
    setColumnVisibility,
  };
}

export type DataTableState = ReturnType<typeof useDataTable>;
