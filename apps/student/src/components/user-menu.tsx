"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useTheme } from "next-themes";

import { initials } from "@/lib/format";
import { signOut } from "@/lib/auth/client";
import { SegmentedControl } from "@/components/primitives/segmented-control";

type ThemeValue = "light" | "system" | "dark";

/** Header avatar dropdown: profile identity, theme control, sign out. */
export function UserMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [pending, setPending] = React.useState(false);

  const onSignOut = async () => {
    if (pending) return;
    setPending(true);
    try {
      await signOut();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="grid size-[38px] place-items-center rounded-full bg-brand-soft text-[12.5px] font-bold text-brand outline-1 -outline-offset-1 outline-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:outline-white/10"
        >
          {initials(name)}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          className="z-50 w-60 origin-(--radix-dropdown-menu-content-transform-origin) rounded-[14px] bg-surface p-1.5 shadow-[0_16px_40px_-16px_rgba(20,20,18,0.3)] ring-1 ring-black/5 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 dark:shadow-none dark:ring-white/10"
        >
          <div className="px-2.5 pt-2 pb-2.5">
            <div className="truncate text-[13.5px] font-semibold text-ink">{name}</div>
            <div className="truncate text-[12.5px] text-ink-3">{email}</div>
          </div>
          <DropdownMenu.Separator className="-mx-1.5 h-px bg-line-divider" />
          <div className="flex items-center justify-between gap-3 px-2.5 py-2">
            <span className="text-[13px] text-ink-2">Theme</span>
            <SegmentedControl
              size="icon"
              value={(theme ?? "system") as ThemeValue}
              onChange={setTheme}
              options={[
                { value: "light", title: "Light", icon: <Sun className="size-4" strokeWidth={1.7} /> },
                { value: "system", title: "System", icon: <Monitor className="size-4" strokeWidth={1.7} /> },
                { value: "dark", title: "Dark", icon: <Moon className="size-4" strokeWidth={1.7} /> },
              ]}
            />
          </div>
          <DropdownMenu.Separator className="-mx-1.5 mb-1 h-px bg-line-divider" />
          <DropdownMenu.Item
            onSelect={onSignOut}
            disabled={pending}
            className="flex cursor-pointer items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13.5px] font-medium text-ink-2 outline-none data-disabled:opacity-50 data-highlighted:bg-hover-surface data-highlighted:text-ink"
          >
            <LogOut className="size-4 shrink-0" strokeWidth={1.7} />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
