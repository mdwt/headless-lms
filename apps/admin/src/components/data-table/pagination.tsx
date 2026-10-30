"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatNumber } from "@/lib/format";

const PAGE_SIZES = [10, 20, 30, 50];

/** Server-side pagination footer. Hidden while everything fits on one page. */
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
  if (pageCount === 1 && page === 1 && total <= Math.min(...PAGE_SIZES)) return null;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-4 px-3">
      <p className="text-sm text-ink-3 tabular-nums" aria-live="polite">
        {isFetching ? (
          "Updating…"
        ) : (
          <>
            {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}
          </>
        )}
      </p>

      <div className="flex items-center gap-3">
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger
            size="sm"
            className="border-transparent text-ink-3 shadow-none hover:bg-hover hover:text-ink max-sm:hidden"
            aria-label="Rows per page"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {PAGE_SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s} per page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
