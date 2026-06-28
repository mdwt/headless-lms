"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";

/** Sticky bottom footer nav (handoff §12). */
export function FooterNav({
  isCompleted,
  prevDisabled,
  nextDisabled,
  onPrev,
  onNext,
  onMarkComplete,
}: {
  isCompleted: boolean;
  prevDisabled: boolean;
  nextDisabled: boolean;
  onPrev: () => void;
  onNext: () => void;
  onMarkComplete: () => void;
}) {
  const ghost = (disabled: boolean): React.CSSProperties => ({
    border: "1px solid #e0ddd4",
    background: "#fff",
    color: disabled ? "#c2bfb5" : "#4a4843",
    cursor: disabled ? "default" : "pointer",
  });

  return (
    <div
      className="flex flex-none items-center justify-between gap-3 border-t border-line-strong px-[22px] py-3"
      style={{ background: "#fbfaf8" }}
    >
      <button
        type="button"
        onClick={onPrev}
        disabled={prevDisabled}
        className="inline-flex items-center gap-[7px] rounded-full px-4 py-2.5 text-[13.5px] font-semibold"
        style={ghost(prevDisabled)}
      >
        <ChevronLeft className="size-4" />
        Previous
      </button>

      <button
        type="button"
        onClick={onMarkComplete}
        className="inline-flex items-center gap-2 rounded-full py-[11px] text-[14px] font-semibold"
        style={
          isCompleted
            ? { background: "var(--brand-soft)", color: "var(--brand)", padding: "11px 22px" }
            : { background: "var(--brand)", color: "#fff", padding: "11px 24px" }
        }
      >
        {isCompleted && <Check className="size-4" strokeWidth={2.4} />}
        {isCompleted ? "Completed" : "Mark as complete"}
      </button>

      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="inline-flex items-center gap-[7px] rounded-full px-4 py-2.5 text-[13.5px] font-semibold"
        style={ghost(nextDisabled)}
      >
        {nextDisabled ? "Finish" : "Next lesson"}
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
