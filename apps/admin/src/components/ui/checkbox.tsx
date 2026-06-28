import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Native checkbox styled purely with CSS state variants (no JS toggling).
 * Larger on mobile, brand fill when checked.
 */
function Checkbox({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <span className="group inline-grid size-5 shrink-0 grid-cols-1 sm:size-4">
      <input
        type="checkbox"
        data-slot="checkbox"
        className={cn(
          "col-start-1 row-start-1 appearance-none rounded-[5px] border border-input bg-surface",
          "checked:border-brand checked:bg-brand indeterminate:border-brand indeterminate:bg-brand",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          "disabled:border-line disabled:bg-surface-2 disabled:checked:bg-surface-3",
          "forced-colors:appearance-auto",
          className,
        )}
        {...props}
      />
      <svg
        viewBox="0 0 14 14"
        fill="none"
        className="pointer-events-none col-start-1 row-start-1 size-7/8 self-center justify-self-center stroke-brand-contrast group-has-disabled:stroke-ink-4"
        aria-hidden="true"
      >
        <path
          d="M3 8L6 11L11 3.5"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="group-not-has-checked:opacity-0"
        />
      </svg>
    </span>
  );
}

export { Checkbox };
