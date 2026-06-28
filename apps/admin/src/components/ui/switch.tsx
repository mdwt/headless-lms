"use client";

import * as React from "react";
import { Switch as Sw } from "radix-ui";
import { cn } from "@/lib/utils";

function Switch({ className, ...props }: React.ComponentProps<typeof Sw.Root>) {
  return (
    <Sw.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent p-0.5 transition-colors outline-none",
        "bg-surface-3 data-[state=checked]:bg-brand",
        "focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <Sw.Thumb
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-surface shadow-sm ring-1 ring-ink/5 transition-transform",
          "data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",
        )}
      />
    </Sw.Root>
  );
}

export { Switch };
