"use client";

import * as React from "react";
import { Menu } from "lucide-react";

import type { Session } from "@/lib/auth/client";
import { navForRole } from "./nav";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";
import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

/**
 * Authenticated layout shell. Fixed sidebar on desktop; a hamburger-triggered
 * sheet on mobile (every app must have a mobile nav). Session-aware: shows the
 * org, the current user, and sign-out.
 */
export function AppShell({ session, children }: { session: Session; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const items = navForRole(session.user.role);

  return (
    <div className="isolate min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-14 items-center px-4">
          <Logo org={session.organization.name} />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <SidebarNav items={items} />
        </div>
        <div className="border-t border-line p-2">
          <UserMenu user={session.user} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-surface/85 px-4 backdrop-blur lg:hidden">
        <Logo org={session.organization.name} />
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <div className="flex h-14 items-center border-b border-line px-4">
              <Logo org={session.organization.name} />
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3">
              <SidebarNav items={items} onNavigate={() => setMobileOpen(false)} />
            </div>
            <div className="border-t border-line p-2">
              <UserMenu user={session.user} />
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Content */}
      <main className="lg:pl-60">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
