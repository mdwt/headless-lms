"use client";

/**
 * Browser-side Better Auth client, wired to the headless-LMS API (`apps/api`),
 * which mounts better-auth at `/api/auth`.
 *
 * Browser-only: sign-in/out/up plus the live `useSession` hook (used on the
 * login page). The student app has no org/role concept, so no org plugin is
 * registered here — just email credential auth. The authoritative session for
 * Server Components is resolved on the server (`lib/auth/server-session.ts`).
 */

import { createAuthClient } from "better-auth/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const authClient = createAuthClient({
  // better-auth appends its basePath (`/api/auth`) to this origin; the browser
  // carries the session cookie cross-origin via credentials:include.
  baseURL: API_URL,
});

export const { signIn, signOut, signUp, useSession } = authClient;
