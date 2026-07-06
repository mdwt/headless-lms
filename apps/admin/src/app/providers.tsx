"use client";

import * as React from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * App-wide client providers. Server data no longer flows through a client query
 * cache — reads are RSC (Server Components fetch via the SDK) and writes are
 * Server Actions with `revalidatePath` — so there is no QueryClient here.
 *
 * Auth is enforced entirely server-side: the Next proxy + the `(dashboard)`
 * server session gate (`getServerSession`) redirect unauthenticated or expired
 * sessions to `/login`, and Server Actions surface failures as toasts. This
 * wrapper just provides tooltips and the toast portal.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      {children}
      <Toaster />
    </TooltipProvider>
  );
}
