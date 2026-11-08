"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatNumber } from "@/lib/format";

type Point = { date: string; count: number; total: number };

const dateLabel = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatDate(date: string): string {
  return dateLabel.format(new Date(`${date}T00:00:00Z`));
}

function ChartTip({ active, payload }: { active?: boolean; payload?: { payload?: Point }[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 shadow-md">
      <div className="text-sm font-semibold text-ink">{formatNumber(point.total)} going</div>
      <div className="text-xs text-ink-3">
        {formatDate(point.date)} · {formatNumber(point.count)}{" "}
        {point.count === 1 ? "grant" : "grants"}
      </div>
    </div>
  );
}

export function GrantsChart({ data }: { data: Point[] }) {
  const total = data.length > 0 ? data[data.length - 1].total : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-medium text-ink">Grants over time</h2>
        <p className="text-sm text-ink-3">
          <span className="font-semibold text-ink proportional-nums">{formatNumber(total)}</span>{" "}
          direct {total === 1 ? "grant" : "grants"} before the start, by the day each was made
        </p>
      </div>

      {data.length === 0 ? (
        <div className="flex h-56 items-center justify-center rounded-card border border-dashed border-line text-sm text-ink-3">
          No one has been granted the event yet.
        </div>
      ) : (
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
                type="stepAfter"
                dataKey="total"
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
      )}
    </div>
  );
}
