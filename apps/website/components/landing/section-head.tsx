import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("label flex items-center gap-2", className)}>
      <span className="dot" />
      {children}
    </div>
  );
}

export function ArrowLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("link-arrow", className)}>
      {children}
      <ArrowRight className="size-3.5" />
    </Link>
  );
}

export function SectionHead({
  label,
  title,
  lede,
  link,
}: {
  label: string;
  title: ReactNode;
  lede: ReactNode;
  link?: { href: string; label: string };
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-end">
      <div>
        <SectionLabel>{label}</SectionLabel>
        <h2 className="h-section mt-5 max-w-[16ch]">{title}</h2>
      </div>
      <div className="lg:pb-2">
        <p className="lede max-w-[520px]">{lede}</p>
        {link && (
          <ArrowLink href={link.href} className="mt-5">
            {link.label}
          </ArrowLink>
        )}
      </div>
    </div>
  );
}
