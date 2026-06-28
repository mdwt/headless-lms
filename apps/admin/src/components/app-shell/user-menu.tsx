"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, LogOut } from "lucide-react";

import { signOut } from "@/lib/auth/client";
import { ROLE_LABEL } from "@/lib/roles";
import { NameAvatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionUser } from "@/lib/api/types";

/** Signed-in user control: identity, role, and sign-out. */
export function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function handleSignOut() {
    setPending(true);
    await signOut();
    router.replace("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:bg-hover">
        <NameAvatar name={user.name} image={user.image} className="size-8" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-ink">{user.name}</span>
          <span className="truncate text-xs text-ink-4">{ROLE_LABEL[user.role]}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-ink-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-60">
        <DropdownMenuLabel>
          <span className="block truncate font-medium text-ink">{user.name}</span>
          <span className="block truncate font-normal text-ink-4">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="danger" onClick={handleSignOut} disabled={pending}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
