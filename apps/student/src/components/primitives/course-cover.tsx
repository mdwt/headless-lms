import { cn } from "@/lib/utils";
import { coverGradient } from "@/lib/covers";
import type { CoverTone } from "@/lib/types";

/**
 * Tonal gradient cover used by hero, cards, list rows, and the video poster.
 * Sizing comes from className; `letterClassName` controls the faint initial.
 */
export function CourseCover({
  tone,
  category,
  letter,
  expired = false,
  className,
  eyebrowClassName,
  letterClassName,
  children,
}: {
  tone: CoverTone;
  category?: string;
  letter: string;
  expired?: boolean;
  className?: string;
  eyebrowClassName?: string;
  letterClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ background: coverGradient(tone), filter: expired ? "saturate(0.5)" : undefined }}
    >
      {/* top-right radial highlight */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 80% 0%, rgba(255,255,255,0.13), transparent 55%)",
        }}
      />
      {expired && (
        <div className="pointer-events-none absolute inset-0" style={{ background: "rgba(18,18,16,0.46)" }} />
      )}
      {/* giant faint initial, bottom-right */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-1 -bottom-6 z-0 font-semibold leading-none",
          letterClassName,
        )}
        style={{ color: "rgba(255,255,255,0.08)" }}
      >
        {letter}
      </span>
      {category && (
        <span
          className={cn(
            "relative z-[1] text-[10.5px] tracking-[0.04em] text-white/[0.74]",
            eyebrowClassName,
          )}
        >
          {category}
        </span>
      )}
      {children}
    </div>
  );
}
