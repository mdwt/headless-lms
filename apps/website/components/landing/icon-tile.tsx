import type { CSSProperties, ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";

const tones = [
  { color: "var(--brand-violet)", tilt: "-6deg" },
  { color: "var(--brand-coral)", tilt: "5deg" },
  { color: "var(--brand-mint)", tilt: "-3deg" },
];

export function IconTile({
  icon: Icon,
  index,
  className,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  index: number;
  className?: string;
}) {
  const tone = tones[index % tones.length];
  return (
    <span
      className={cn("icon-tile size-9", className)}
      style={{ "--tile": tone.color, "--tilt": tone.tilt } as CSSProperties}
    >
      <Icon aria-hidden className="size-[18px]" strokeWidth={2.25} />
    </span>
  );
}
