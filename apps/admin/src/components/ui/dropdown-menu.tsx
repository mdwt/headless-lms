"use client";

import * as React from "react";
import { Check, ChevronRight, Circle } from "lucide-react";
import { DropdownMenu as DM } from "radix-ui";
import { cn } from "@/lib/utils";

const DropdownMenu = (p: React.ComponentProps<typeof DM.Root>) => <DM.Root data-slot="dropdown-menu" {...p} />;
const DropdownMenuTrigger = (p: React.ComponentProps<typeof DM.Trigger>) => (
  <DM.Trigger data-slot="dropdown-menu-trigger" {...p} />
);
const DropdownMenuGroup = (p: React.ComponentProps<typeof DM.Group>) => <DM.Group {...p} />;

function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-40 overflow-hidden rounded-lg border border-line bg-surface p-1 text-ink shadow-[0_16px_40px_-16px_rgba(24,24,27,0.25)]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className,
        )}
        {...props}
      />
    </DM.Portal>
  );
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DM.Item> & { inset?: boolean; variant?: "default" | "danger" }) {
  return (
    <DM.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none",
        "transition-colors focus:bg-hover focus:text-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-3",
        inset && "pl-8",
        variant === "danger" && "text-danger focus:bg-danger-soft focus:text-danger [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof DM.CheckboxItem>) {
  return (
    <DM.CheckboxItem
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md py-1.5 pr-2 pl-8 text-sm outline-none select-none focus:bg-hover data-[disabled]:opacity-50",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span className="absolute left-2 grid size-4 place-items-center">
        <DM.ItemIndicator>
          <Check className="size-3.5 text-brand" />
        </DM.ItemIndicator>
      </span>
      {children}
    </DM.CheckboxItem>
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DM.RadioItem>) {
  return (
    <DM.RadioItem
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md py-1.5 pr-2 pl-8 text-sm outline-none select-none focus:bg-hover",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 grid size-4 place-items-center">
        <DM.ItemIndicator>
          <Circle className="size-2 fill-brand text-brand" />
        </DM.ItemIndicator>
      </span>
      {children}
    </DM.RadioItem>
  );
}

const DropdownMenuRadioGroup = (p: React.ComponentProps<typeof DM.RadioGroup>) => <DM.RadioGroup {...p} />;

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DM.Label> & { inset?: boolean }) {
  return (
    <DM.Label
      className={cn("px-2 py-1.5 text-xs font-medium text-ink-3", inset && "pl-8", className)}
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DM.Separator>) {
  return <DM.Separator className={cn("-mx-1 my-1 h-px bg-line", className)} {...props} />;
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("ml-auto text-xs tracking-widest text-ink-4", className)} {...props} />;
}

const DropdownMenuSub = (p: React.ComponentProps<typeof DM.Sub>) => <DM.Sub {...p} />;
const DropdownMenuSubTrigger = ({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DM.SubTrigger> & { inset?: boolean }) => (
  <DM.SubTrigger
    className={cn(
      "flex cursor-default items-center rounded-md px-2 py-1.5 text-sm outline-none select-none focus:bg-hover data-[state=open]:bg-hover",
      inset && "pl-8",
      className,
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto size-4 text-ink-3" />
  </DM.SubTrigger>
);
const DropdownMenuSubContent = ({ className, ...props }: React.ComponentProps<typeof DM.SubContent>) => (
  <DM.SubContent
    className={cn(
      "z-50 min-w-32 overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-lg",
      className,
    )}
    {...props}
  />
);

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuRadioGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
