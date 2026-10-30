"use client";

import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Consistent row-action affordance: a 3-dot trigger + a menu of items. */
export function RowActions({
  children,
  label = "Row actions",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        aria-label={label}
        className="grid size-7 place-items-center rounded-md text-ink-4 outline-none hover:bg-hover-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:bg-hover data-[state=open]:text-ink"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()} className="w-44">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
