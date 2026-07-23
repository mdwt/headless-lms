import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Status treatments for course covers/rows (handoff). */
export function CompletedPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[12px] font-semibold text-brand shadow-[0_2px_8px_-4px_rgba(20,20,18,0.25)] dark:shadow-none",
        className,
      )}
    >
      <Check className="size-3" strokeWidth={2.4} />
      Completed
    </span>
  );
}

export function ExpiredPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium text-white/90 backdrop-blur-sm",
        className,
      )}
      style={{ background: "rgba(20,20,18,0.5)" }}
    >
      Expired
    </span>
  );
}

export function StatusChip({
  status,
  className,
}: {
  status: "in-progress" | "not-started" | "completed";
  className?: string;
}) {
  const map = {
    "in-progress": "bg-status-progress-bg text-status-progress-fg",
    "not-started": "bg-status-idle-bg text-status-idle-fg",
    completed: "bg-brand-soft text-brand",
  } as const;
  const label = { "in-progress": "In progress", "not-started": "Not started", completed: "Completed" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium",
        map[status],
        className,
      )}
    >
      {label[status]}
    </span>
  );
}
