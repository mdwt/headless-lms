"use client";

import * as React from "react";
import { Popover as P } from "radix-ui";
import { cn } from "@/lib/utils";

const Popover = (p: React.ComponentProps<typeof P.Root>) => <P.Root data-slot="popover" {...p} />;
const PopoverTrigger = (p: React.ComponentProps<typeof P.Trigger>) => <P.Trigger data-slot="popover-trigger" {...p} />;
const PopoverAnchor = (p: React.ComponentProps<typeof P.Anchor>) => <P.Anchor {...p} />;

function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-64 rounded-lg border border-line bg-surface p-1 text-ink shadow-[0_16px_40px_-16px_rgba(24,24,27,0.25)] outline-none",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className,
        )}
        {...props}
      />
    </P.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
