"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, SlidersHorizontal, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const ITEMS: { segment: string; label: string; icon: LucideIcon }[] = [
  { segment: "", label: "General", icon: SlidersHorizontal },
  { segment: "messages", label: "Direct messages", icon: MessageCircle },
];

export function CommunitySettingsNav({ communityId }: { communityId: string }) {
  const pathname = usePathname();
  const base = `/communities/${communityId}/settings`;

  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Community settings">
      {ITEMS.map((item) => {
        const href = item.segment ? `${base}/${item.segment}` : base;
        const active = pathname === href;
        const Icon = item.icon;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm whitespace-nowrap outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring/40",
              active ? "bg-hover text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
            )}
          >
            <Icon
              className={cn(
                "size-4 shrink-0",
                active ? "text-ink" : "text-ink-4 group-hover:text-ink-2",
              )}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
