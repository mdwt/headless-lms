"use client";

import * as React from "react";
import type {
  ColumnFiltersState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import type { ListParams } from "@/lib/api/types";

/**
 * Owns all table state (server-side: page, sort, search, faceted filters,
 * column visibility) and derives the `ListParams` the query needs. One hook,
 * used by every list page, so pagination/sort/filter behave identically.
 */
export function useDataTable(opts?: { pageSize?: number; initialSort?: SortingState }) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(opts?.pageSize ?? 10);
  const [sorting, setSorting] = React.useState<SortingState>(opts?.initialSort ?? []);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});

  // Debounce search → avoids a request per keystroke.
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 whenever the result set changes shape. Done during render
  // (React's documented "adjust state when inputs change" pattern with a
  // previous-value state) so there's no extra render pass and no effect.
  const resetKey = JSON.stringify([debouncedSearch, columnFilters, pageSize, sorting]);
  const [prevResetKey, setPrevResetKey] = React.useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    if (page !== 1) setPage(1);
  }

  const filters = React.useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const f of columnFilters) {
      if (Array.isArray(f.value) && f.value.length) out[f.id] = f.value as string[];
    }
    return out;
  }, [columnFilters]);

  const params: ListParams = React.useMemo(
    () => ({
      page,
      pageSize,
      search: debouncedSearch || undefined,
      sort: sorting.map((s) => ({ id: s.id, desc: s.desc })),
      filters,
    }),
    [page, pageSize, debouncedSearch, sorting, filters],
  );

  return {
    params,
    page,
    setPage,
    pageSize,
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
