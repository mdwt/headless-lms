"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Blocks,
  Building2,
  KeyRound,
  PlugZap,
  ShieldCheck,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

import { usePermissions } from "@/lib/auth/permissions-context";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  needs?: Permission;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    label: "Organization",
    items: [
      {
        href: "/settings/general",
        label: "General",
        icon: Building2,
        needs: "organizations:read",
      },
      { href: "/settings/team", label: "Team", icon: Users, needs: "people:read" },
      { href: "/settings/roles", label: "Roles", icon: ShieldCheck, needs: "roles:read" },
      {
        href: "/settings/integrations",
        label: "Integrations",
        icon: Blocks,
        needs: "integrations:read",
      },
      {
        href: "/settings/notifications",
        label: "Notifications",
        icon: Bell,
        needs: "notification_categories:read",
      },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/settings/account", label: "Profile", icon: User },
      { href: "/settings/connected-apps", label: "Connected apps", icon: PlugZap },
      { href: "/settings/api-keys", label: "API keys", icon: KeyRound, needs: "api_keys:read" },
    ],
  },
];

/**
 * Grouped settings sub-navigation (Vercel/Linear pattern): a vertical list of
 * real routes grouped into sections, each item shown by its own permission.
 * Active state is derived from the pathname.
 */
export function SettingsNav() {
  const pathname = usePathname();
  const permissions = usePermissions();
  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => !item.needs || permissions.has(item.needs)),
  })).filter((g) => g.items.length > 0);

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
