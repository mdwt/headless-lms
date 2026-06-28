"use client";

import * as React from "react";
import { Tabs as Tb } from "radix-ui";
import { cn } from "@/lib/utils";

const Tabs = (p: React.ComponentProps<typeof Tb.Root>) => <Tb.Root data-slot="tabs" {...p} />;

function TabsList({ className, ...props }: React.ComponentProps<typeof Tb.List>) {
  return (
    <Tb.List
      data-slot="tabs-list"
      className={cn("inline-flex items-center gap-1 overflow-x-auto border-b border-line", className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof Tb.Trigger>) {
  return (
    <Tb.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative -mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-ink-3 outline-none transition-colors",
        "hover:text-ink focus-visible:text-ink",
        "data-[state=active]:border-brand data-[state=active]:text-ink",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof Tb.Content>) {
  return <Tb.Content data-slot="tabs-content" className={cn("outline-none", className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
