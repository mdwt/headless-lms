"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import type { NavItem } from "./nav";

/** Vertical nav. Active item = darker text + soft surface, never high-contrast. */
export function SidebarNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5" aria-label="Primary">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring/40",
              active
                ? "bg-surface font-medium text-ink shadow-sm ring-1 ring-ink/5"
                : "text-ink-2 hover:bg-hover-2 hover:text-ink",
            )}
          >
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors",
                active ? "text-brand" : "text-ink-4 group-hover:text-ink-2",
              )}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
