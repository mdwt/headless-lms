"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface Stat {
  label: string;
  value: number;
}

/** Column count adapts to how many stats a role sees (3 vs 6). */
function colsClass(count: number): string {
  return count <= 3
    ? "@md:grid-cols-3"
    : "@md:grid-cols-3 @4xl:grid-cols-6";
}

/**
 * KPI strip rendered as a single bordered grid: the container background bleeds
 * through 1px gaps to draw hairline dividers between cells — no per-card chrome,
 * no icons. Values are large and tabular; labels truncate to a single line.
 */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="@container">
      <dl
        className={cn(
          "grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line",
          colsClass(stats.length),
        )}
      >
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1.5 bg-surface px-4 py-3.5">
            <dt className="truncate text-[0.8125rem] text-ink-3">{s.label}</dt>
            <dd className="text-2xl font-semibold tracking-tight text-ink tabular-nums">
              {formatNumber(s.value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function StatStripSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="@container">
      <dl
        className={cn(
          "grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line",
          colsClass(count),
        )}
      >
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2.5 bg-surface px-4 py-3.5">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-7 w-12" />
          </div>
        ))}
      </dl>
    </div>
  );
}
