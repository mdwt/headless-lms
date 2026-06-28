"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api/http";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { type DataTableState } from "./use-data-table";
import { FacetedFilter, type FacetOption } from "./faceted-filter";
import { ViewOptions } from "./view-options";
import { Pagination } from "./pagination";
import { TableEmpty, TableError, TableForbidden, TableSkeleton } from "./states";

export interface FacetConfig {
  columnId: string;
  title: string;
  options: FacetOption[];
}

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  rows: TData[] | undefined;
  total: number;
  state: DataTableState;
  isLoading: boolean;
  isFetching?: boolean;
  isError: boolean;
  error?: unknown;
  refetch: () => void;
  getRowId: (row: TData) => string;
  searchPlaceholder?: string;
  facets?: FacetConfig[];
  /** Right-aligned toolbar slot — e.g. a "New course" primary button. */
  toolbarActions?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  onRowClick?: (row: TData) => void;
}

/**
 * The single data-table for every list in the app. Server-side sort, search,
 * faceted filter, pagination, and column visibility — with loading, empty,
 * error (retry) and forbidden (403) states all handled here so pages don't
 * repeat them.
 */
export function DataTable<TData>({
  columns,
  rows,
  total,
  state,
  isLoading,
  isFetching,
  isError,
  error,
  refetch,
  getRowId,
  searchPlaceholder = "Search…",
  facets = [],
  toolbarActions,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyAction,
  onRowClick,
}: DataTableProps<TData>) {
  const table = useReactTable({
    data: rows ?? [],
    columns,
    getRowId,
    state: {
      sorting: state.sorting,
      columnFilters: state.columnFilters,
      columnVisibility: state.columnVisibility,
    },
    onSortingChange: state.setSorting,
    onColumnFiltersChange: state.setColumnFilters,
    onColumnVisibilityChange: state.setColumnVisibility,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    enableMultiSort: true,
    getCoreRowModel: getCoreRowModel(),
  });

  const isForbidden = isError && error instanceof ApiError && error.status === 403;
  const colCount = table.getVisibleLeafColumns().length;
  const hasToolbarFilters = state.search.length > 0 || state.columnFilters.length > 0;
  const showData = !isLoading && !isError && (rows?.length ?? 0) > 0;

  return (
    <div className="flex flex-col">
      {/* Toolbar — search + facets + view options + page actions */}
      <div className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-4" />
            <Input
              value={state.search}
              onChange={(e) => state.setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label="Search"
              className="pl-9"
            />
            {state.search && (
              <button
                type="button"
                onClick={() => state.setSearch("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-ink-4 transition-colors hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {facets.map((f) => {
            const column = table.getColumn(f.columnId);
            if (!column) return null; // facet column not mounted — skip gracefully
            return <FacetedFilter key={f.columnId} column={column} title={f.title} options={f.options} />;
          })}
          {hasToolbarFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                state.setSearch("");
                state.setColumnFilters([]);
              }}
            >
              Reset
              <X />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ViewOptions table={table} />
          {toolbarActions}
        </div>
      </div>

      {/* Table — directly on the background, horizontal rules only */}
      <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
        <div className="inline-block min-w-full px-4 py-2 align-middle sm:px-6 lg:px-8">
          <table className="w-full border-collapse text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      scope="col"
                      style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                      className={cn(
                        "px-3 pb-2 text-left text-xs font-medium whitespace-nowrap text-ink-3",
                        (header.column.columnDef.meta as { align?: string })?.align === "right" &&
                          "text-right",
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>

            {isLoading ? (
              <TableSkeleton columns={colCount} />
            ) : isForbidden ? (
              <TableForbidden colSpan={colCount} />
            ) : isError ? (
              <TableError colSpan={colCount} onRetry={refetch} />
            ) : showData ? (
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    className={cn(
                      "border-t border-line transition-colors",
                      onRowClick && "cursor-pointer hover:bg-hover",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cn(
                          "px-3 py-2.5 align-middle text-ink-2",
                          (cell.column.columnDef.meta as { align?: string })?.align === "right" &&
                            "text-right",
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ) : (
              <TableEmpty
                colSpan={colCount}
                title={emptyTitle}
                description={emptyDescription}
                action={emptyAction}
                filtered={hasToolbarFilters}
              />
            )}
          </table>
        </div>
      </div>

      {!isLoading && !isError && (
        <Pagination
          page={state.page}
          pageSize={state.pageSize}
          total={total}
          onPageChange={state.setPage}
          onPageSizeChange={state.setPageSize}
          isFetching={isFetching}
        />
      )}
    </div>
  );
}
