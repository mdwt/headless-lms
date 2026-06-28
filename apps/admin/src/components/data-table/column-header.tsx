"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown, EyeOff } from "lucide-react";
import type { Column } from "@tanstack/react-table";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Sortable column header. Multi-sort is supported via shift-click (TanStack). */
export function ColumnHeader<TData, TValue>({
  column,
  title,
  className,
  align = "left",
}: {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
  align?: "left" | "right";
}) {
  if (!column.getCanSort() && !column.getCanHide()) {
    return <span className={cn("text-ink-3", className)}>{title}</span>;
  }

  const sorted = column.getIsSorted();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "-mx-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-ink-3 outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:text-ink",
          align === "right" && "flex-row-reverse",
          className,
        )}
      >
        <span>{title}</span>
        {sorted === "desc" ? (
          <ArrowDown className="size-3.5" />
        ) : sorted === "asc" ? (
          <ArrowUp className="size-3.5" />
        ) : (
          <ChevronsUpDown className="size-3.5 opacity-60" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align === "right" ? "end" : "start"}>
        {column.getCanSort() && (
          <>
            <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
              <ArrowUp />
              Ascending
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
              <ArrowDown />
              Descending
            </DropdownMenuItem>
          </>
        )}
        {column.getCanSort() && column.getCanHide() && <DropdownMenuSeparator />}
        {column.getCanHide() && (
          <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
            <EyeOff />
            Hide column
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
