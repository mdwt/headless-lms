"use client";

import * as React from "react";
import type { Session } from "./client";
import type { Caller } from "../api/sdk";
import type { SessionUser } from "../api/types";

const SessionContext = React.createContext<Session | null>(null);

/** Provided by the dashboard gate once a session is guaranteed. */
export function SessionProvider({ session, children }: { session: Session; children: React.ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useCurrentUser(): SessionUser {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useCurrentUser must be used within the dashboard");
  return ctx.user;
}

export function useOrganization() {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useOrganization must be used within the dashboard");
  return ctx.organization;
}

/** The role + scope passed to list queries so the API can filter server-side. */
export function useCaller(): Caller {
  const user = useCurrentUser();
  return { role: user.role, scopedCourseIds: user.scopedCourseIds };
}
