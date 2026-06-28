"use client";

import * as React from "react";
import { Ban, RotateCw, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Skeleton rows that mirror the real table layout while loading. */
export function TableSkeleton({ columns, rows = 8 }: { columns: number; rows?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-t border-line">
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c} className="px-3 py-3">
              <Skeleton
                className={cn("h-4", c === 0 ? "w-40" : c === columns - 1 ? "w-8" : "w-24")}
                // stagger widths so it reads as content, not a grid
                style={{ width: `${[60, 40, 30, 50, 35, 24][c % 6]}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

/** Shared shell for the non-data states so they sit centered in the table body. */
function StateRow({
  colSpan,
  icon,
  title,
  description,
  action,
}: {
  colSpan: number;
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <tbody>
      <tr>
        <td colSpan={colSpan} className="px-3 py-16">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-center">
            <div className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-3">
              {icon}
            </div>
            <div className="flex flex-col gap-1">
              <p className="font-medium text-ink">{title}</p>
              {description ? <p className="text-sm text-ink-3 text-pretty">{description}</p> : null}
            </div>
            {action}
          </div>
        </td>
      </tr>
    </tbody>
  );
}

export function TableEmpty({
  colSpan,
  title,
  description,
  action,
  filtered,
}: {
  colSpan: number;
  title: string;
  description?: string;
  action?: React.ReactNode;
  filtered?: boolean;
}) {
  return (
    <StateRow
      colSpan={colSpan}
      icon={<SearchX className="size-5" />}
      title={filtered ? "No matching results" : title}
      description={filtered ? "Try adjusting your search or filters." : description}
      action={filtered ? undefined : action}
    />
  );
}

export function TableError({ colSpan, onRetry }: { colSpan: number; onRetry: () => void }) {
  return (
    <StateRow
      colSpan={colSpan}
      icon={<RotateCw className="size-5" />}
      title="Couldn't load this data"
      description="Something went wrong while fetching. Check your connection and try again."
      action={
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCw />
          Retry
        </Button>
      }
    />
  );
}

export function TableForbidden({ colSpan }: { colSpan: number }) {
  return (
    <StateRow
      colSpan={colSpan}
      icon={<Ban className="size-5" />}
      title="You don't have access to this"
      description="Your role doesn't permit viewing these records. Contact an owner or admin if you need access."
    />
  );
}
