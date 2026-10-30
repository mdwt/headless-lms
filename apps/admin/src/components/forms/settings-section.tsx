import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * The outermost wrapper of every form/settings surface: one narrow column
 * (aligned to the page's left edge) with a single hairline between
 * stacked sections (or the forms wrapping them). Content fills the column
 * edge to edge — no rails, no extra width caps anywhere inside.
 */
export function SettingsSurface({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex w-full max-w-3xl flex-col divide-y divide-line",
        "[&>*]:py-8 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * One borderless settings section: an optional heading above the fields, the
 * fields filling the column, and the form's actions right-aligned under them.
 */
export function SettingsSection({
  title,
  description,
  footer,
  children,
}: {
  title?: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6">
      {title || description ? (
        <header className="flex flex-col gap-1">
          {title ? <h2 className="text-sm font-semibold text-ink">{title}</h2> : null}
          {description ? <p className="text-sm text-ink-3 text-pretty">{description}</p> : null}
        </header>
      ) : null}
      <div className="flex flex-col gap-5">
        {children}
        {footer ? <div className="flex items-center justify-end gap-3 pt-2">{footer}</div> : null}
      </div>
    </section>
  );
}

/** One setting: label + hint on the left, its control on the right. */
export function SettingRow({
  id,
  label,
  hint,
  error,
  controlClassName,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  controlClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        {error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : hint ? (
          <p className="text-sm text-ink-4 text-pretty">{hint}</p>
        ) : null}
      </div>
      <div className={cn("shrink-0 sm:pt-0.5", controlClassName)}>{children}</div>
    </div>
  );
}
