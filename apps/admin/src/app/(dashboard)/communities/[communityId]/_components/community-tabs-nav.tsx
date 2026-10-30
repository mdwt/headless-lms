"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Flag, LayoutList, Settings2, Users, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const TABS: { segment: string; label: string; icon: LucideIcon; managersOnly: boolean }[] = [
  { segment: "spaces", label: "Spaces", icon: LayoutList, managersOnly: true },
  { segment: "members", label: "Members", icon: Users, managersOnly: false },
  { segment: "moderation", label: "Moderation", icon: Flag, managersOnly: false },
  { segment: "notifications", label: "Notifications", icon: Bell, managersOnly: true },
  { segment: "settings", label: "Settings", icon: Settings2, managersOnly: true },
];

export function CommunityTabsNav({
  communityId,
  canManage,
}: {
  communityId: string;
  canManage: boolean;
}) {
  const pathname = usePathname();
  const base = `/communities/${communityId}`;

  return (
    <nav
      aria-label="Community sections"
      className="flex items-center gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line)]"
    >
      {TABS.filter((tab) => canManage || !tab.managersOnly).map(
        ({ segment, label, icon: Icon }) => {
          const href = `${base}/${segment}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={segment}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap outline-none focus-visible:text-ink",
                active ? "border-brand text-ink" : "border-transparent text-ink-3 hover:text-ink",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          );
        },
      )}
    </nav>
  );
}
