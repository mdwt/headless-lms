"use client";

import * as React from "react";
import { Check, ListFilter } from "lucide-react";
import type { Column } from "@tanstack/react-table";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface FacetOption {
  label: string;
  value: string;
}

/** Multi-select faceted filter rendered as a popover (per-column filtering). */
export function FacetedFilter<TData, TValue>({
  column,
  title,
  options,
}: {
  column?: Column<TData, TValue>;
  title: string;
  options: FacetOption[];
}) {
  const selected = new Set((column?.getFilterValue() as string[]) ?? []);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" className="border-dashed">
          <ListFilter />
          {title}
          {selected.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-0.5 h-4" />
              <Badge variant="brand" className="rounded px-1 font-medium">
                {selected.size}
              </Badge>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" align="start">
        <div role="listbox" aria-label={title} className="flex flex-col">
          {options.map((option) => {
            const isSelected = selected.has(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  const next = new Set(selected);
                  if (isSelected) next.delete(option.value);
                  else next.add(option.value);
                  const arr = Array.from(next);
                  column?.setFilterValue(arr.length ? arr : undefined);
                }}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink outline-none transition-colors hover:bg-hover focus-visible:bg-hover"
              >
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-[5px] border",
                    isSelected ? "border-brand bg-brand text-brand-contrast" : "border-input",
                  )}
                >
                  {isSelected && <Check className="size-3" />}
                </span>
                <span className="flex-1">{option.label}</span>
              </button>
            );
          })}
          {selected.size > 0 && (
            <>
              <Separator className="my-1" />
              <button
                type="button"
                onClick={() => column?.setFilterValue(undefined)}
                className="rounded-md px-2 py-1.5 text-center text-sm text-ink-3 outline-none transition-colors hover:bg-hover focus-visible:bg-hover"
              >
                Clear filter
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
