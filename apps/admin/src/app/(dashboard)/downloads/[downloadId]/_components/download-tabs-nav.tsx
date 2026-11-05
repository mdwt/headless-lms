"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, KeyRound, Settings2, UserCog, type LucideIcon } from "lucide-react";

import { usePermissions } from "@/lib/auth/permissions-context";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

// Route-per-tab navigation for the download. Each tab is its own segment; the
// active tab is derived from the pathname. The `assets` segment matches the
// table and API, but the visible label is "Files" — the word an author
// expects. Styled to match the shadcn Tabs (underlined active tab) but backed
// by real navigation, so tabs are deep-linkable and each server-renders its
// own data.
const TABS: { segment: string; label: string; icon: LucideIcon; needs: Permission[] }[] = [
  { segment: "assets", label: "Files", icon: FileText, needs: ["downloads:read"] },
  { segment: "details", label: "Details", icon: Settings2, needs: ["downloads:write"] },
  { segment: "access", label: "Access", icon: KeyRound, needs: ["access:read"] },
  { segment: "people", label: "People", icon: UserCog, needs: ["people:read"] },
];

export function DownloadTabsNav({ downloadId }: { downloadId: string }) {
  const pathname = usePathname();
  const permissions = usePermissions();
  const tabs = TABS.filter((tab) => permissions.hasAny(tab.needs, downloadId));
  const base = `/downloads/${downloadId}`;

  return (
    <nav
      aria-label="Download sections"
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
