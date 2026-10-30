"use client";

import type { CSSProperties, ReactNode } from "react";
import { Ban, Inbox, RotateCw, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton rows that mirror the real table layout while loading. */
export function TableSkeleton({ columns, rows = 8 }: { columns: number; rows?: number }) {
  return (
    <tbody>
      <tr aria-hidden="true">
        <td colSpan={columns} className="h-2 p-0" />
      </tr>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c} className="px-3 py-3.5">
              <Skeleton
                className="h-3.5 w-(--w) rounded-full"
                style={{ "--w": `${[60, 40, 30, 50, 35, 24][c % 6]}%` } as CSSProperties}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

/**
 * The page-level empty state: replaces the whole table (toolbar, headings and
 * pagination) when a list has nothing in it yet.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-96 flex-col items-center justify-center gap-6 rounded-card bg-surface-2/60 px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-4">
        <span className="text-ink-4 [&_svg]:size-6">{icon ?? <Inbox />}</span>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-semibold tracking-tight text-balance text-ink">{title}</h2>
          {description ? (
            <p className="max-w-[46ch] text-sm text-pretty text-ink-3">{description}</p>
          ) : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export function TableNoMatches({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-20 text-center">
      <SearchX className="size-6 text-ink-4" aria-hidden />
      <div className="flex flex-col gap-1.5">
        <p className="text-base font-semibold tracking-tight text-ink">No matching results</p>
        <p className="text-sm text-pretty text-ink-3">
          Try a different search or clear the filters.
        </p>
      </div>
      <Button variant="secondary" onClick={onReset}>
        Clear filters
      </Button>
    </div>
  );
}

function StateRow({
  colSpan,
  icon,
  title,
  description,
  action,
}: {
  colSpan: number;
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <tbody>
      <tr>
        <td colSpan={colSpan} className="px-3 py-20">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-4 text-center">
            <span className="text-ink-4 [&_svg]:size-6">{icon}</span>
            <div className="flex flex-col gap-1.5">
              <p className="text-base font-semibold tracking-tight text-ink">{title}</p>
              {description ? <p className="text-sm text-pretty text-ink-3">{description}</p> : null}
            </div>
            {action}
          </div>
        </td>
      </tr>
    </tbody>
  );
}

export function TableError({ colSpan, onRetry }: { colSpan: number; onRetry: () => void }) {
  return (
    <StateRow
      colSpan={colSpan}
      icon={<RotateCw />}
      title="Couldn't load this data"
      description="Something went wrong while fetching. Check your connection and try again."
      action={
        <Button variant="secondary" onClick={onRetry}>
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
      icon={<Ban />}
      title="You don't have access to this"
      description="Your role doesn't permit viewing these records. Contact an owner or admin if you need access."
    />
  );
}
