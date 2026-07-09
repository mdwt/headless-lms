"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatNumber } from "@/lib/format";

/** Server-side pagination footer with page-size control. */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  isFetching,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  isFetching?: boolean;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-line px-1 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-ink-3" aria-live="polite">
        {isFetching ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 animate-pulse rounded-full bg-ink-4" />
            Updating…
          </span>
        ) : (
          <>
            <span className="font-medium text-ink-2">{formatNumber(from)}</span>–
            <span className="font-medium text-ink-2">{formatNumber(to)}</span> of{" "}
            <span className="font-medium text-ink-2">{formatNumber(total)}</span>
          </>
        )}
      </p>

      <div className="flex items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-3 max-sm:sr-only">Rows</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger size="sm" className="w-[4.5rem]" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 30, 50].map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <span className="text-sm text-ink-3 tabular-nums">
          Page {page} of {pageCount}
        </span>

        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="icon-sm"
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
            aria-label="First page"
          >
            <ChevronsLeft />
          </Button>
          <Button
            variant="secondary"
            size="icon-sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="secondary"
            size="icon-sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
          <Button
            variant="secondary"
            size="icon-sm"
            onClick={() => onPageChange(pageCount)}
            disabled={page >= pageCount}
            aria-label="Last page"
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
