import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Button — the single button system for the whole app.
 * Flat, structural, one disciplined indigo for the primary action. Two
 * heights only (sm 32px, default 36px) per the back-office density rules.
 */
const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // one filled primary, solid ring matching the fill
        primary:
          "bg-brand text-brand-contrast hover:bg-brand-strong focus-visible:ring-brand/40",
        // secondary: bordered surface
        secondary:
          "border border-line-strong bg-surface text-ink-2 hover:bg-hover hover:text-ink",
        // ghost: text-only
        ghost: "text-ink-2 hover:bg-hover hover:text-ink",
        // destructive: muted by default (per buttons guideline); promote to
        // a filled style only inside confirm dialogs via `destructiveSolid`
        destructive:
          "border border-danger/20 bg-surface text-danger hover:bg-danger-soft",
        destructiveSolid:
          "bg-danger text-white hover:bg-danger/90 focus-visible:ring-danger/40",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5 has-[>svg:first-child]:pl-2.5 has-[>svg:last-child]:pr-2.5",
        sm: "h-8 px-3 text-[0.8125rem] has-[>svg:first-child]:pl-2 has-[>svg:last-child]:pr-2",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
