"use client";

import { SlidersHorizontal } from "lucide-react";
import type { Table } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Column show/hide control. */
export function ViewOptions<TData>({ table }: { table: Table<TData> }) {
  const columns = table
    .getAllColumns()
    .filter((c) => typeof c.accessorFn !== "undefined" && c.getCanHide());

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Toggle columns" title="Columns">
          <SlidersHorizontal />
          <span className="sr-only">Columns</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={column.getIsVisible()}
            onCheckedChange={(value) => column.toggleVisibility(!!value)}
            onSelect={(e) => e.preventDefault()}
          >
            <span className="capitalize">{columnLabel(column.id)}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function columnLabel(id: string): string {
  return id
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .trim();
}
