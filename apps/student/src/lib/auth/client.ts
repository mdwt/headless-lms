"use client";

/**
 * Browser-side Better Auth client. It calls `/api/auth` on the domain the
 * browser is on, which this app forwards to the headless-LMS API (`apps/api`),
 * so the session cookie belongs to this domain and the API knows which
 * organization the sign-in is for.
 *
 * Browser-only: sign-in/out/up, password reset, sign-in links and the live
 * `useSession` hook (used on the login page). The student app has no org/role
 * concept, so no org plugin is registered here. The authoritative session for
 * Server Components is resolved on the server (`lib/auth/server-session.ts`).
 */

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  ...(typeof window !== "undefined" && { baseURL: window.location.origin }),
  plugins: [magicLinkClient()],
});

export const { signIn, signOut, signUp, useSession } = authClient;
