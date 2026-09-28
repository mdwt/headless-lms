"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ComponentProps, ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

import { cn } from "../lib/utils";
import { useMounted } from "../hooks/use-mounted";

export function TooltipProvider({
  delayDuration = 200,
  disableHoverableContent = true,
  skipDelayDuration = 0,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      delayDuration={delayDuration}
      disableHoverableContent={disableHoverableContent}
      skipDelayDuration={skipDelayDuration}
      {...props}
    />
  );
}

export const Tooltip = TooltipPrimitive.Root;

export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipPortal = TooltipPrimitive.Portal;

export function TooltipContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Content
      className={cn(
        "z-9999 overflow-hidden rounded-md bg-primary px-2 py-1.5 font-semibold text-primary-foreground text-xs shadow-md",
        className,
      )}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

export function TooltipTC({
  children,
  className,
  content,
  defaultOpen,
  delayDuration,
  disableHoverableContent,
  open,
  onOpenChange,
  ...props
}: {
  content: ReactNode;
} & ComponentProps<typeof TooltipPrimitive.Content> &
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>) {
  const mounted = useMounted();

  if (!mounted) {
    return children;
  }

  return (
    <TooltipProvider>
      <Tooltip
        defaultOpen={defaultOpen}
        delayDuration={delayDuration}
        disableHoverableContent={disableHoverableContent}
        onOpenChange={onOpenChange}
        open={open}
      >
        <TooltipTrigger asChild>{children}</TooltipTrigger>

        <TooltipPortal>
          <TooltipContent className={className} {...props}>
            {content}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}

type TooltipProps<T extends ElementType> = {
  shortcut?: ReactNode;
  tooltip?: ReactNode;
  tooltipContentProps?: Omit<ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>, "children">;
  tooltipProps?: Omit<ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>, "children">;
  tooltipTriggerProps?: ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>;
} & ComponentProps<T>;

export function withTooltip<T extends ElementType>(Component: T) {
  return function ExtendComponent({
    shortcut,
    tooltip,
    tooltipContentProps,
    tooltipProps,
    tooltipTriggerProps,
    ...props
  }: TooltipProps<T>) {
    const isMounted = useMounted();

    const component = <Component {...(props as ComponentProps<T>)} />;

    if (tooltip && isMounted) {
      return (
        <TooltipProvider>
          <Tooltip {...tooltipProps}>
            <TooltipTrigger asChild {...tooltipTriggerProps}>
              {component}
            </TooltipTrigger>

            <TooltipPortal>
              <TooltipContent {...tooltipContentProps}>
                {tooltip}
                {shortcut && <div className="mt-px text-gray-400">{shortcut}</div>}
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return component;
  };
}
