import { cn } from "@/lib/utils";

/** Thin fully-rounded progress bar. Height/track set via className/trackClassName. */
export function ProgressBar({
  percent,
  className,
  trackClassName,
  fillClassName,
}: {
  percent: number;
  className?: string;
  trackClassName?: string;
  fillClassName?: string;
}) {
  return (
    <div
      className={cn("h-[6px] w-full overflow-hidden rounded-full bg-track-card", trackClassName, className)}
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full bg-brand transition-[width] duration-300", fillClassName)}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}
