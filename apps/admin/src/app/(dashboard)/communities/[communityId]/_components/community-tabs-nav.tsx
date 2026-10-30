"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS: { segment: string; label: string; managersOnly: boolean }[] = [
  { segment: "spaces", label: "Spaces", managersOnly: true },
  { segment: "members", label: "Members", managersOnly: false },
  { segment: "moderation", label: "Moderation", managersOnly: false },
  { segment: "settings", label: "Settings", managersOnly: true },
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
      className="flex items-center gap-6 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line)]"
    >
      {TABS.filter((tab) => canManage || !tab.managersOnly).map(({ segment, label }) => {
        const href = `${base}/${segment}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={segment}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 py-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:text-ink",
              active ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
