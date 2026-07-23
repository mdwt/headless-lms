"use client";

import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label?: string;
  icon?: React.ReactNode;
  count?: number;
  title?: string;
}

/** Pill segmented control (track-seg well, active segment lifted). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "md" | "icon";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex bg-track-seg",
        size === "icon" ? "gap-[3px] rounded-[10px] p-[3px]" : "gap-1 rounded-full p-1",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.title}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center justify-center gap-2 transition-colors",
              size === "icon"
                ? "h-[30px] w-8 rounded-[8px]"
                : "rounded-full px-[14px] py-[7px] text-[13px]",
              active
                ? "bg-surface text-ink shadow-[0_1px_2px_rgba(20,20,18,0.08)] dark:bg-hover-surface dark:shadow-none"
                : "text-ink-3 hover:text-ink-2",
              active && size !== "icon" && "font-semibold",
            )}
          >
            {opt.icon}
            {opt.label}
            {typeof opt.count === "number" && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  active ? "bg-brand-soft text-brand" : "bg-track-card text-ink-3",
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
