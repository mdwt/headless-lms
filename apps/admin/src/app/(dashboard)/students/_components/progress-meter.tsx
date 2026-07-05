import { cn } from "@/lib/utils";

/**
 * Minimal, dependency-free progress bar. A neutral track with a single brand
 * fill — used in the students table and on the student detail view.
 */
export function ProgressMeter({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1.5 overflow-hidden rounded-full bg-surface-3", className)}
    >
      <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Right-aligned meter + percentage, sized for a table cell. */
export function ProgressCell({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="ml-auto flex w-36 items-center justify-end gap-2.5">
      <ProgressMeter value={pct} className="w-full" />
      <span className="w-9 shrink-0 text-right text-xs text-ink-3">{pct}%</span>
    </div>
  );
}
