import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type ?? "text"}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-surface px-3 text-sm text-ink",
        "placeholder:text-ink-4 max-sm:text-base",
        "transition-colors outline-none",
        "focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25 -outline-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-danger aria-invalid:ring-danger/20 aria-invalid:focus-visible:ring-danger/25",
        "file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
