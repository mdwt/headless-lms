"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { ServerSession } from "./server-session";
import type { Organization, SessionUser } from "../api/types";

/**
 * Thin client session context, **seeded from the server-resolved session**
 * (`getServerSession` in the `(dashboard)` layout). There is no live better-auth
 * stitching here anymore — the server already validated the cookie and resolved
 * user + active org, and passes them down as props. Client components
 * read them synchronously via the hooks below.
 */

interface SessionContextValue {
  user: SessionUser;
  organization: Organization;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** Provided by the dashboard layout once an authenticated session is resolved. */
export function SessionProvider({
  session,
  children,
}: {
  session: ServerSession;
  children: ReactNode;
}) {
  const value = useMemo<SessionContextValue>(
    () => ({
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      },
      // Non-null in the authenticated status the layout mounts this under.
      organization: session.organization ?? { id: "", name: "", slug: "" },
    }),
    [session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useCurrentUser(): SessionUser {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useCurrentUser must be used within the dashboard");
  return ctx.user;
}

export function useOrganization(): Organization {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useOrganization must be used within the dashboard");
  return ctx.organization;
}
