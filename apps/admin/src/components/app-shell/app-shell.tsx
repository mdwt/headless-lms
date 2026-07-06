"use client";

import * as React from "react";
import { Menu } from "lucide-react";

import type { Organization, Role, SessionUser } from "@/lib/api/types";
import { navForRole } from "./nav";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";
import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

/**
 * Authenticated layout shell. Fixed sidebar on desktop; a hamburger-triggered
 * sheet on mobile (every app must have a mobile nav). Takes the server-resolved
 * `user`/`organization`/`role` as props (no client session hook): shows the org,
 * the current user, and sign-out.
 */
export function AppShell({
  user,
  organization,
  role,
  children,
}: {
  /** Server-resolved user identity (role is passed separately). */
  user: { id: string; name: string; email: string; image: string | null };
  organization: Organization;
  role: Role;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const items = navForRole(role);
  // Compose the SessionUser the UserMenu consumes (role + not-yet-wired scope).
  const menuUser: SessionUser = { ...user, role, scopedCourseIds: [] };

  return (
    <div className="isolate min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface-2 lg:flex">
        <div className="flex h-14 items-center px-4">
          <Logo org={organization.name} />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <SidebarNav items={items} />
        </div>
        <div className="border-t border-line p-2">
          <UserMenu user={menuUser} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-surface-2/80 px-4 backdrop-blur lg:hidden">
        <Logo org={organization.name} />
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <div className="flex h-14 items-center border-b border-line px-4">
              <Logo org={organization.name} />
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3">
              <SidebarNav items={items} onNavigate={() => setMobileOpen(false)} />
            </div>
            <div className="border-t border-line p-2">
              <UserMenu user={menuUser} />
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
