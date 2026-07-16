"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Blocks, Building2, Plug, User, Users, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}
interface NavGroup {
  label: string;
  managerOnly: boolean;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    label: "Organization",
    managerOnly: true,
    items: [
      { href: "/settings/general", label: "General", icon: Building2 },
      { href: "/settings/team", label: "Team", icon: Users },
      { href: "/settings/integrations", label: "Integrations", icon: Blocks },
      { href: "/settings/apps", label: "Apps", icon: Plug },
    ],
  },
  {
    label: "Account",
    managerOnly: false,
    items: [{ href: "/settings/account", label: "Profile", icon: User }],
  },
];

/**
 * Grouped settings sub-navigation (Vercel/Linear pattern): a vertical list of
 * real routes grouped into sections. The Organization section is manager-only.
 * Active state is derived from the pathname.
 */
export function SettingsNav({ manager }: { manager: boolean }) {
  const pathname = usePathname();
  const groups = GROUPS.filter((g) => manager || !g.managerOnly);

  return (
    <nav className="flex flex-col gap-6" aria-label="Settings">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-2.5 text-xs font-medium tracking-wide text-ink-4 uppercase">
            {group.label}
          </p>
          {group.items.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
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
        </div>
      ))}
    </nav>
  );
}
