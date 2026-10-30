import { CopyButton } from "@/components/copy-button";
import { siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

export function CopyCommand({
  command = siteConfig.installCommand,
  tone = "default",
  className,
}: {
  command?: string;
  tone?: "default" | "inverse" | "warm";
  className?: string;
}) {
  const skin = {
    default: "bg-surface-2 text-foreground ring-line",
    inverse: "bg-white/10 text-white ring-white/30 backdrop-blur-md",
    warm: "bg-white/45 text-[#2a1a14] ring-[#2a1a14]/15 backdrop-blur-md",
  }[tone];
  const prompt = {
    default: "text-subtle",
    inverse: "text-white/50",
    warm: "text-[#2a1a14]/50",
  }[tone];
  const button = {
    default: "",
    inverse: "text-white/70 hover:bg-white/10 hover:text-white",
    warm: "text-[#2a1a14]/60 hover:bg-white/50 hover:text-[#2a1a14]",
  }[tone];

  return (
    <div
      className={cn(
        "flex h-11 min-w-0 items-center gap-3 rounded-[6px] pr-1.5 pl-4 ring-1",
        skin,
        className,
      )}
    >
      <span className={cn("font-mono text-[13px] select-none", prompt)}>$</span>
      <code className="min-w-0 flex-1 truncate font-mono text-[13px]">{command}</code>
      <CopyButton code={command} className={cn("size-8 rounded-[5px]", button)} />
    </div>
  );
}
