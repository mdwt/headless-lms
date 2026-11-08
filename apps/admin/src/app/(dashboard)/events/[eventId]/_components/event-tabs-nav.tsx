"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FileText, Settings2, UserCog, Users, type LucideIcon } from "lucide-react";

import { usePermissions } from "@/lib/auth/permissions-context";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const TABS: { segment: string; label: string; icon: LucideIcon; needs: Permission[] }[] = [
  { segment: "details", label: "Details", icon: Settings2, needs: ["events:write"] },
  { segment: "attendees", label: "Attendees", icon: Users, needs: ["events:read"] },
  { segment: "analytics", label: "Analytics", icon: BarChart3, needs: ["events:read"] },
  { segment: "assets", label: "Files", icon: FileText, needs: ["events:read"] },
  { segment: "people", label: "People", icon: UserCog, needs: ["people:read"] },
];

export function EventTabsNav({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const permissions = usePermissions();
  const tabs = TABS.filter((tab) => permissions.hasAny(tab.needs, eventId));
  const base = `/events/${eventId}`;

  return (
    <nav
      aria-label="Event sections"
      className="flex items-center gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line)]"
    >
      {tabs.map(({ segment, label, icon: Icon }) => {
        const href = `${base}/${segment}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={segment}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:text-ink",
              active ? "border-brand text-ink" : "border-transparent text-ink-3 hover:text-ink",
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
