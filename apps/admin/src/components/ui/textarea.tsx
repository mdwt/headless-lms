import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-20 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-ink",
        "placeholder:text-ink-4 max-sm:text-base",
        "transition-colors outline-none field-sizing-content",
        "focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25 -outline-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-danger aria-invalid:ring-danger/20",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
