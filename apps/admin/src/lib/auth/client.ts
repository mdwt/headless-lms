"use client";

/**
 * Browser-side Better Auth client, wired to the headless-LMS API (`apps/api`),
 * which mounts better-auth at `/api/auth` with the organization plugin
 * (owner/admin/instructor roles).
 *
 * This is now **browser-only**: sign-in/out/up, the org mutations, and the live
 * `useSession` hook (used on the login page). The dashboard session/org/role is
 * resolved on the server (`lib/auth/server-session.ts`) and seeded into the
 * client via `SessionProvider` — there is no client-side session stitching here.
 */

import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { inviteClient } from "better-invite";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const authClient = createAuthClient({
  // better-auth appends its basePath (`/api/auth`) to this origin; the browser
  // carries the session cookie cross-origin via credentials:include.
  baseURL: API_URL,
  plugins: [organizationClient(), inviteClient()],
});

export const { signIn, signOut, signUp, organization, useSession } = authClient;
