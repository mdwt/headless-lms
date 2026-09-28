"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { EnrollmentPoint } from "@/lib/api/types";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ENROLLMENT_RANGES, type EnrollmentRangeKey } from "./enrollment-ranges";

const dateLabel = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatDate(date: string): string {
  return dateLabel.format(new Date(`${date}T00:00:00Z`));
}

function RangeSelector({ active }: { active: EnrollmentRangeKey }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function select(key: EnrollmentRangeKey) {
    const params = new URLSearchParams(searchParams);
    params.set("range", key);
    startTransition(() => router.replace(`?${params.toString()}`, { scroll: false }));
  }

  return (
    <div
      role="group"
      aria-label="Time range"
      data-pending={isPending || undefined}
      className="inline-flex items-center gap-0.5 rounded-md border border-line p-0.5"
    >
      {ENROLLMENT_RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          aria-pressed={r.key === active}
          onClick={() => select(r.key)}
          className={cn(
            "rounded-[5px] px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
            r.key === active ? "bg-selected text-ink" : "text-ink-3 hover:bg-hover hover:text-ink",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function ChartTip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { value?: number; payload?: EnrollmentPoint }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 shadow-md">
      <div className="text-sm font-semibold text-ink">
        {formatNumber(point.count)} {point.count === 1 ? "enrollment" : "enrollments"}
      </div>
      <div className="text-xs text-ink-3">{formatDate(point.date)}</div>
    </div>
  );
}

/**
 * Enrollments-over-time panel: flat hairline container (no shadow), a single
 * monochrome series — 2px ink line over a faint wash — with a crosshair
 * tooltip and a preset range selector that scopes it via the `range` param.
 */
export function EnrollmentsChart({
  data,
  range,
}: {
  data: EnrollmentPoint[];
  range: EnrollmentRangeKey;
}) {
  const total = data.reduce((sum, p) => sum + p.count, 0);
  const days = ENROLLMENT_RANGES.find((r) => r.key === range)?.days ?? 30;

  return (
    <div className="flex flex-col gap-4 bg-surface p-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-medium text-ink">Enrollments</h2>
          <p className="text-sm text-ink-3">
            <span className="font-semibold text-ink proportional-nums">{formatNumber(total)}</span>{" "}
            in the last {days} days
          </p>
        </div>
        <RangeSelector active={range} />
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeWidth={1} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
              tickMargin={8}
              tick={{ fill: "var(--ink-4)", fontSize: 11 }}
            />
            <YAxis
              allowDecimals={false}
              width={36}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--ink-4)", fontSize: 11 }}
              tickFormatter={(v: number) => formatNumber(v)}
            />
            <Tooltip
              content={<ChartTip />}
              cursor={{ stroke: "var(--ink-faint)", strokeWidth: 1 }}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="var(--ink)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="var(--ink)"
              fillOpacity={0.06}
              dot={false}
              activeDot={{ r: 4, fill: "var(--ink)", stroke: "var(--surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
