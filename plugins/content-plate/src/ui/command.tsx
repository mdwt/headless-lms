"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Command as CommandPrimitive } from "cmdk";
import type { ComponentProps } from "react";

import { cn } from "../lib/utils";
import { inputVariants } from "./input";

const commandVariants = cva(
  "flex size-full flex-col rounded-md bg-popover text-popover-foreground focus-visible:outline-hidden",
  {
    defaultVariants: {
      variant: "default",
    },
    variants: {
      variant: {
        combobox: "overflow-visible bg-transparent has-data-readonly:w-fit",
        default: "overflow-hidden",
      },
    },
  },
);

function Command({
  className,
  variant,
  ...props
}: ComponentProps<typeof CommandPrimitive> & VariantProps<typeof commandVariants>) {
  return (
    <CommandPrimitive
      className={cn(commandVariants({ variant }), className)}
      data-slot="command"
      {...props}
    />
  );
}

function CommandInput({
  className,
  variant,
  wrapClassName,
  ...props
}: ComponentProps<typeof CommandPrimitive.Input> &
  VariantProps<typeof inputVariants> & {
    wrapClassName?: string;
  }) {
  return (
    <div
      className={cn("mt-2 flex w-full items-center px-3 py-1.5", wrapClassName)}
      cmdk-input-wrapper=""
      data-slot="command-input-wrapper"
    >
      <CommandPrimitive.Input
        className={cn(inputVariants({ variant }), className)}
        data-slot="command-input"
        {...props}
      />
    </div>
  );
}

function CommandList({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      className={cn("max-h-[500px] overflow-y-auto overflow-x-hidden py-1.5", className)}
      data-slot="command-list"
      {...props}
    />
  );
}

function CommandEmpty({ className, ...props }: ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      className={cn("py-6 text-center text-sm", className)}
      data-slot="command-empty"
      {...props}
    />
  );
}

export const commandItemVariants = cva(
  "relative mx-1 flex h-[28px] cursor-default select-none items-center rounded-sm px-2 text-sm outline-hidden data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50",
  {
    defaultVariants: {
      variant: "default",
    },
    variants: {
      variant: {
        default: "",
        menuItem: cn(
          "w-[calc(100%-8px)] min-w-56 px-2.5",
          "no-focus-ring cursor-pointer text-accent-foreground hover:bg-accent focus:bg-accent focus:text-accent-foreground",
        ),
      },
    },
  },
);

function CommandItem({
  className,
  variant,
  ...props
}: ComponentProps<typeof CommandPrimitive.Item> & VariantProps<typeof commandItemVariants>) {
  return (
    <CommandPrimitive.Item
      className={cn(commandItemVariants({ variant }), className)}
      data-slot="command-item"
      {...props}
    />
  );
}

export { Command, CommandEmpty, CommandInput, CommandItem, CommandList };
