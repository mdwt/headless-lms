import { cn } from "@/lib/utils";
import { KIND_LABELS, type Kind } from "./catalogue";

const COLORS: Record<Kind, string> = {
  read: "bg-brand-mint",
  write: "bg-brand-violet",
  destructive: "bg-brand-coral",
};

export function KindMark({ kind, className }: { kind: Kind; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12.5px] text-body", className)}>
      <span aria-hidden="true" className={cn("size-[7px] shrink-0 rounded-[2px]", COLORS[kind])} />
      {KIND_LABELS[kind]}
    </span>
  );
}
