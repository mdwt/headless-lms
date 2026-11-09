"use client";

import { cva } from "class-variance-authority";
import { CheckIcon } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { useCallback, useState, type ComponentProps } from "react";

import { cn } from "../lib/utils";

const dropdownMenuLabelVariants = cva(
  cn("mt-1.5 mb-2 cursor-default select-none px-[14px] font-medium text-muted-foreground text-xs"),
  {
    variants: {
      inset: {
        true: "pl-8",
      },
    },
  },
);

export type DropdownMenuProps = DropdownMenuPrimitive.DropdownMenuProps;

export function DropdownMenu(props: DropdownMenuProps) {
  return <DropdownMenuPrimitive.Root {...props} />;
}

export function DropdownMenuTrigger(props: DropdownMenuPrimitive.DropdownMenuTriggerProps) {
  return <DropdownMenuPrimitive.Trigger {...props} />;
}

export function DropdownMenuGroup(props: DropdownMenuPrimitive.DropdownMenuGroupProps) {
  return <DropdownMenuPrimitive.Group className="py-1.5" {...props} />;
}

export function DropdownMenuPortal(props: DropdownMenuPrimitive.DropdownMenuPortalProps) {
  return <DropdownMenuPrimitive.Portal {...props} />;
}

export function DropdownMenuRadioGroup(props: DropdownMenuPrimitive.DropdownMenuRadioGroupProps) {
  return <DropdownMenuPrimitive.RadioGroup {...props} />;
}

export function DropdownMenuContent({
  className,
  portal,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content> & {
  portal?: boolean;
}) {
  const content = (
    <DropdownMenuPrimitive.Content
      className={cn(
        "no-focus-ring z-50 min-w-32 max-w-[100vw] overflow-hidden rounded-lg bg-popover p-0 text-popover-foreground text-sm shadow-floating",
        "data-[state=closed]:hidden data-[side=bottom]:origin-top data-[side=left]:origin-right data-[side=right]:origin-left data-[side=top]:origin-bottom data-[state=open]:animate-zoom",
        className,
      )}
      sideOffset={4}
      {...props}
    />
  );

  if (portal) {
    return <DropdownMenuPrimitive.Portal>{content}</DropdownMenuPrimitive.Portal>;
  }

  return content;
}

export function DropdownMenuRadioItem({
  children,
  className,
  hideIcon,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.RadioItem> & {
  hideIcon?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.RadioItem
      className={cn(
        "no-focus-ring relative flex select-none items-center rounded-sm pr-2 pl-8 transition-bg-ease focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        "mx-1 h-[28px] cursor-pointer gap-2 px-2.5 data-[state=highlighted]:bg-accent data-[state=highlighted]:text-accent-foreground [&_svg]:size-4",
        className,
      )}
      {...props}
    >
      {!hideIcon && (
        <span className="absolute right-2 flex size-3.5 items-center justify-center">
          <DropdownMenuPrimitive.ItemIndicator>
            <CheckIcon />
          </DropdownMenuPrimitive.ItemIndicator>
        </span>
      )}
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

export function DropdownMenuLabel({
  className,
  inset,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn(dropdownMenuLabelVariants({ inset }), className)}
      {...props}
    />
  );
}

export function useOpenState() {
  const [open, setOpen] = useState(false);

  const onOpenChange = useCallback(
    (_value = !open) => {
      setOpen(_value);
    },
    [open],
  );

  return {
    open,
    onOpenChange,
  };
}
