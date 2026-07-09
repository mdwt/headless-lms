"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, KeyRound, Layers, Settings2, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// Route-per-tab navigation for the course. Each tab is its own segment; the
// active tab is derived from the pathname. Styled to match the shadcn Tabs
// (underlined active tab) but backed by real navigation, so tabs are
// deep-linkable and each server-renders its own data.
const TABS: { segment: string; label: string; icon: LucideIcon }[] = [
  { segment: "details", label: "Details", icon: Settings2 },
  { segment: "content", label: "Content", icon: Layers },
  { segment: "analytics", label: "Analytics", icon: BarChart3 },
  { segment: "access", label: "Access", icon: KeyRound },
];

export function CourseTabsNav({ courseId }: { courseId: string }) {
  const pathname = usePathname();
  const base = `/courses/${courseId}`;

  return (
    <nav
      aria-label="Course sections"
      className="-mb-px flex items-center gap-1 overflow-x-auto border-b border-line"
    >
      {TABS.map(({ segment, label, icon: Icon }) => {
        const href = `${base}/${segment}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={segment}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative -mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:text-ink",
              active
                ? "border-brand text-ink"
                : "border-transparent text-ink-3 hover:text-ink",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
