"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Select as S } from "radix-ui";
import { cn } from "@/lib/utils";

const Select = (p: React.ComponentProps<typeof S.Root>) => <S.Root data-slot="select" {...p} />;
const SelectGroup = (p: React.ComponentProps<typeof S.Group>) => <S.Group {...p} />;
const SelectValue = (p: React.ComponentProps<typeof S.Value>) => <S.Value {...p} />;

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof S.Trigger> & { size?: "sm" | "default" }) {
  return (
    <S.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md border border-input bg-surface px-3 text-sm whitespace-nowrap text-ink outline-none transition-colors",
        "data-[size=default]:h-9 data-[size=sm]:h-8",
        "data-[placeholder]:text-ink-4",
        "focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25",
        "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger",
        "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
      <S.Icon asChild>
        <ChevronDown className="size-4 text-ink-3" />
      </S.Icon>
    </S.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentProps<typeof S.Content>) {
  return (
    <S.Portal>
      <S.Content
        data-slot="select-content"
        position={position}
        className={cn(
          "relative z-50 max-h-72 min-w-[8rem] overflow-hidden rounded-lg border border-line bg-surface text-ink shadow-[0_16px_40px_-16px_rgba(24,24,27,0.25)]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1",
          className,
        )}
        {...props}
      >
        <S.ScrollUpButton className="flex h-6 items-center justify-center">
          <ChevronUp className="size-4 text-ink-3" />
        </S.ScrollUpButton>
        <S.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width)",
          )}
        >
          {children}
        </S.Viewport>
        <S.ScrollDownButton className="flex h-6 items-center justify-center">
          <ChevronDown className="size-4 text-ink-3" />
        </S.ScrollDownButton>
      </S.Content>
    </S.Portal>
  );
}

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof S.Item>) {
  return (
    <S.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center rounded-md py-1.5 pr-8 pl-2 text-sm outline-none select-none",
        "focus:bg-hover focus:text-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <S.ItemText>{children}</S.ItemText>
      <span className="absolute right-2 grid size-4 place-items-center">
        <S.ItemIndicator>
          <Check className="size-4 text-brand" />
        </S.ItemIndicator>
      </span>
    </S.Item>
  );
}

function SelectLabel({ className, ...props }: React.ComponentProps<typeof S.Label>) {
  return (
    <S.Label className={cn("px-2 py-1.5 text-xs font-medium text-ink-3", className)} {...props} />
  );
}
function SelectSeparator({ className, ...props }: React.ComponentProps<typeof S.Separator>) {
  return <S.Separator className={cn("-mx-1 my-1 h-px bg-line", className)} {...props} />;
}

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectSeparator,
};
