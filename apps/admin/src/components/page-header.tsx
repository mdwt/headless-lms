import * as React from "react";
import { cn } from "@/lib/utils";

/** Consistent page title block: heading, right actions, optional children. */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-ink text-balance">{title}</h1>
          {subtitle ? <p className="text-sm text-ink-3">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}
