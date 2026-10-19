import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AppWindow({
  title,
  children,
  className,
  tone = "light",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  tone?: "light" | "dark";
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[10px] shadow-window ring-1",
        tone === "dark" ? "bg-[#0e0e10] ring-white/10" : "bg-raised ring-line",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-8 items-center gap-1.5 border-b px-3.5",
          tone === "dark" ? "border-white/10" : "border-line bg-surface-2",
        )}
      >
        <i className="size-2.5 rounded-full bg-[#ff5f57]" />
        <i className="size-2.5 rounded-full bg-[#febc2e]" />
        <i className="size-2.5 rounded-full bg-[#28c840]" />
        {title && (
          <span
            className={cn(
              "ml-2 truncate font-mono text-[10.5px]",
              tone === "dark" ? "text-white/40" : "text-subtle",
            )}
          >
            {title}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
