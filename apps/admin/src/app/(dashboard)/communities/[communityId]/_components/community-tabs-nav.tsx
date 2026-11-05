"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { usePermissions } from "@/lib/auth/permissions-context";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const TABS: { segment: string; label: string; needs: Permission[] }[] = [
  { segment: "spaces", label: "Spaces", needs: ["communities:read"] },
  { segment: "members", label: "Members", needs: ["access:read"] },
  { segment: "moderation", label: "Moderation", needs: ["communities:moderate"] },
  { segment: "people", label: "People", needs: ["people:read"] },
  { segment: "settings", label: "Settings", needs: ["communities:write"] },
];

export function CommunityTabsNav({ communityId }: { communityId: string }) {
  const pathname = usePathname();
  const permissions = usePermissions();
  const base = `/communities/${communityId}`;

  return (
    <nav
      aria-label="Community sections"
      className="flex items-center gap-6 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line)]"
    >
      {TABS.filter((tab) => permissions.hasAny(tab.needs, communityId)).map(
        ({ segment, label }) => {
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
        },
      )}
    </nav>
  );
}
