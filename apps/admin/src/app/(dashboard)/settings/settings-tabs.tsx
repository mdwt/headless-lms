"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plug, User, Users, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface SettingsTab {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Route-based settings tabs. Each tab is a real URL (deep-linkable, back/forward
 * works), so this is a nav of `Link`s styled as a tab bar rather than a Radix
 * `Tabs` (which swaps client-only panels). Active state comes from the pathname.
 * The Team tab is manager-only; the parent layout decides whether to pass it.
 */
export function SettingsTabs({ manager }: { manager: boolean }) {
  const pathname = usePathname();

  const tabs: SettingsTab[] = [
    ...(manager ? [{ href: "/settings/team", label: "Team", icon: Users }] : []),
    { href: "/settings/apps", label: "Apps", icon: Plug },
    { href: "/settings/account", label: "Account", icon: User },
  ];

  return (
    <nav className="flex items-center gap-1 border-b border-line" aria-label="Settings">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative -mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap outline-none transition-colors",
              "focus-visible:text-ink",
              active
                ? "border-brand text-ink"
                : "text-ink-3 hover:text-ink",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
