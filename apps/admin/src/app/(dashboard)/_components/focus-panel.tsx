"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { formatNumber } from "@/lib/format";

/**
 * Slim, fully-clickable panel that surfaces one actionable count and routes to
 * the page that resolves it. Calm and content-first: a title, one line of
 * context, the number, and a quiet chevron affordance.
 */
export function FocusPanel({
  href,
  title,
  description,
  count,
}: {
  href: string;
  title: string;
  description: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-4 rounded-card bg-surface px-5 py-4 shadow-card ring-1 ring-ink/[0.06] outline-none transition-shadow hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-page"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-ink">{title}</span>
        <span className="truncate text-sm text-ink-3 text-pretty">{description}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-2xl font-semibold tracking-tight text-ink tabular-nums">
          {formatNumber(count)}
        </span>
        <ChevronRight className="size-4 text-ink-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
