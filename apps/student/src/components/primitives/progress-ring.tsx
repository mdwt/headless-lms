import { cn } from "@/lib/utils";

/** Conic course-progress ring (30px, brand fill over ring-conic track, inner punch-out). */
export function ProgressRing({
  percent,
  size = 30,
  className,
  innerClassName,
}: {
  percent: number;
  size?: number;
  className?: string;
  innerClassName?: string;
}) {
  const pct = Math.min(100, Math.max(0, percent));
  return (
    <div
      className={cn("relative grid place-items-center rounded-full", className)}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(var(--brand) ${pct}%, var(--ring-conic) 0)`,
      }}
    >
      <div
        className={cn("rounded-full bg-surface-warm", innerClassName)}
        style={{ width: size - 8, height: size - 8 }}
      />
    </div>
  );
}
