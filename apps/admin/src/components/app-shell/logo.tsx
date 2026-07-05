import { cn } from "@/lib/utils";

/** Wordmark: a small geometric mark + the org name. Calm, no gradient. */
export function Logo({ org, className }: { org: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="grid size-7 shrink-0 place-items-center rounded-[7px] bg-ink text-surface">
        <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
          <path
            d="M3 11.5 8 3l5 8.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M5.5 11.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold tracking-tight text-ink">{org}</span>
        <span className="truncate text-xs text-ink-4">Management</span>
      </span>
    </div>
  );
}
