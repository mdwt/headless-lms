"use client";

import type { ComponentProps } from "react";
import { Tooltip as T } from "radix-ui";
import { cn } from "@/lib/utils";

const TooltipProvider = ({ delayDuration = 200, ...props }: ComponentProps<typeof T.Provider>) => (
  <T.Provider delayDuration={delayDuration} {...props} />
);
const Tooltip = (p: ComponentProps<typeof T.Root>) => <T.Root {...p} />;
const TooltipTrigger = (p: ComponentProps<typeof T.Trigger>) => <T.Trigger {...p} />;

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: ComponentProps<typeof T.Content>) {
  return (
    <T.Portal>
      <T.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-md bg-ink px-2 py-1 text-xs font-medium text-surface",
          "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
      </T.Content>
    </T.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
