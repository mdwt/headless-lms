import type { ComponentType, ReactNode, SVGProps } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Backdrop, type Painting } from "@/components/landing/backdrop";
import { cn } from "@/lib/utils";

const skins = {
  plain: "bg-surface",
  graph: "graph",
  violet: "tile-violet",
};

export function Tile({
  title,
  body,
  icon: Icon,
  href,
  painting,
  focus,
  skin = "plain",
  className,
  frameClassName,
  children,
}: {
  title: string;
  body: ReactNode;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  href?: string;
  painting?: Painting;
  focus?: string;
  skin?: keyof typeof skins;
  className?: string;
  frameClassName?: string;
  children: ReactNode;
}) {
  const content = (
    <>
      <div className="flex items-start gap-4 px-4 pt-4 pb-5 md:px-5 md:pt-5">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em] text-foreground">
            {Icon && <Icon aria-hidden className="size-4 text-subtle" />}
            {title}
          </h3>
          <p className="mt-1.5 max-w-[46ch] text-[14.5px] leading-relaxed text-pretty text-muted-foreground">
            {body}
          </p>
        </div>
        {href && (
          <span className="mt-0.5 ml-auto hidden size-7 shrink-0 items-center justify-center rounded-full text-subtle ring-1 ring-line transition-all group-hover:bg-foreground group-hover:text-background group-hover:ring-foreground sm:inline-flex">
            <ArrowRight className="size-3.5" />
          </span>
        )}
      </div>
      <div
        className={cn(
          "relative flex flex-1 flex-col justify-center overflow-hidden rounded-[12px]",
          !painting && skins[skin],
          frameClassName,
        )}
      >
        {painting && (
          <Backdrop
            name={painting}
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="transition-transform duration-[1400ms] ease-out group-hover:scale-[1.035]"
            style={focus ? { objectPosition: focus } : undefined}
          />
        )}
        <div className="relative">{children}</div>
      </div>
    </>
  );

  const shell = cn(
    "group relative flex flex-col rounded-[18px] bg-background p-2 ring-1 ring-line",
    className,
  );

  return href ? (
    <Link href={href} className={shell}>
      {content}
    </Link>
  ) : (
    <div className={shell}>{content}</div>
  );
}

export function MiniCard({ title, body }: { title: string; body: ReactNode }) {
  return (
    <div className="rounded-[18px] bg-surface-2 p-5 ring-1 ring-line md:p-6">
      <div className="text-[15px] font-semibold tracking-[-0.015em] text-foreground">{title}</div>
      <div className="mt-1 text-[13.5px] leading-relaxed text-pretty text-muted-foreground">
        {body}
      </div>
    </div>
  );
}
