"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, Settings2, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const TABS: { segment: string; label: string; icon: LucideIcon }[] = [
  { segment: "settings", label: "Settings", icon: Settings2 },
  { segment: "deliveries", label: "Deliveries", icon: History },
];

export function WebhookTabsNav({ webhookId }: { webhookId: string }) {
  const pathname = usePathname();
  const base = `/automations/webhooks/${webhookId}`;

  return (
    <nav
      aria-label="Webhook sections"
      className="flex items-center gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line)]"
    >
      {TABS.map(({ segment, label, icon: Icon }) => {
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
