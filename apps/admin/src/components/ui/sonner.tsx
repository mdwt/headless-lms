"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * One toast system for every mutation outcome. Top-right, flat surface,
 * brand/danger accents matched to the design tokens (no default sonner look).
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-right"
      offset={16}
      gap={10}
      toastOptions={{
        classNames: {
          toast:
            "group flex w-full items-start gap-3 rounded-lg border border-line bg-surface p-3.5 text-sm text-ink shadow-[0_16px_40px_-16px_rgba(24,24,27,0.25)]",
          title: "font-medium text-ink",
          description: "text-ink-3",
          actionButton: "rounded-md bg-brand px-2 py-1 text-xs font-medium text-brand-contrast",
          cancelButton: "rounded-md px-2 py-1 text-xs font-medium text-ink-3",
          icon: "mt-0.5",
          success: "[&_[data-icon]]:text-success",
          error: "[&_[data-icon]]:text-danger",
        },
      }}
      style={{ "--border-radius": "0.5rem" } as React.CSSProperties}
      {...props}
    />
  );
}

export { Toaster };
