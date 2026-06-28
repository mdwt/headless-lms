"use client";

/**
 * Auth client.
 *
 * This exposes the exact surface of better-auth's React client so swapping to
 * the real server is a single import change:
 *
 *   import { createAuthClient } from "better-auth/react";
 *   import { organizationClient } from "better-auth/client/plugins";
 *   export const authClient = createAuthClient({
 *     baseURL: process.env.NEXT_PUBLIC_API_URL,
 *     plugins: [organizationClient()],
 *   });
 *   export const { useSession, signIn, signOut } = authClient;
 *
 * Until the API is wired, we back it with an in-memory session that mirrors
 * the `data.user` / `data.session` shape better-auth returns. Roles drive the
 * role-aware UI; change `DEMO_USERS` to preview each role.
 */

import { useSyncExternalStore } from "react";
import { CURRENT_USER, ORG } from "../api/mock-data";
import { setAuthToken } from "../api/http";
import type { Organization, Role, SessionUser } from "../api/types";

export interface Session {
  user: SessionUser;
  organization: Organization;
  token: string;
}

interface AuthState {
  session: Session | null;
  isPending: boolean;
}

/** Demo accounts — password is "password" for all. Pick one to preview a role. */
export const DEMO_USERS: Record<string, { user: SessionUser; label: string }> = {
  "mira@atelier.academy": {
    label: "Owner — full access",
    user: { ...CURRENT_USER, role: "owner", scopedCourseIds: [] },
  },
  "admin@atelier.academy": {
    label: "Admin — full access",
    user: {
      id: "usr_admin",
      name: "Daniel Mercer",
      email: "admin@atelier.academy",
      image: null,
      role: "admin",
      scopedCourseIds: [],
    },
  },
  "instructor@atelier.academy": {
    label: "Instructor — assigned courses + grading",
    user: {
      id: "usr_inst_1",
      name: "Priya Nair",
      email: "instructor@atelier.academy",
      image: null,
      role: "instructor",
      scopedCourseIds: ["crs_002", "crs_008", "crs_014", "crs_020", "crs_026"],
    },
  },
  "student@atelier.academy": {
    label: "Student — no dashboard access",
    user: {
      id: "usr_student",
      name: "Felix Lowell",
      email: "student@atelier.academy",
      image: null,
      role: "student",
      scopedCourseIds: [],
    },
  },
};

const STORAGE_KEY = "admin.session";

let state: AuthState = { session: null, isPending: true };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function set(next: Partial<AuthState>) {
  state = { ...state, ...next };
  setAuthToken(state.session?.token ?? null);
  emit();
}

/** Hydrate from storage once on the client. */
function hydrate() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const email = JSON.parse(raw) as string;
      const found = DEMO_USERS[email];
      if (found) {
        set({ session: makeSession(found.user), isPending: false });
        return;
      }
    }
  } catch {
    // ignore
  }
  set({ isPending: false });
}

function makeSession(user: SessionUser): Session {
  return { user, organization: ORG, token: `mock.${user.id}.token` };
}

let hydrated = false;
function ensureHydrated() {
  if (hydrated) return;
  hydrated = true;
  hydrate();
}

function subscribe(cb: () => void) {
  ensureHydrated();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Mirrors `authClient.useSession()` → `{ data, isPending, error }`. */
export function useSession(): { data: Session | null; isPending: boolean; error: null } {
  const snap = useSyncExternalStore(
    subscribe,
    () => state,
    () => ({ session: null, isPending: true }) as AuthState,
  );
  return { data: snap.session, isPending: snap.isPending, error: null };
}

export const signIn = {
  async email(input: { email: string; password: string }): Promise<{ error: { message: string } | null }> {
    await new Promise((r) => setTimeout(r, 600));
    const found = DEMO_USERS[input.email.trim().toLowerCase()];
    if (!found || input.password.length < 4) {
      return { error: { message: "Invalid email or password" } };
    }
    set({ session: makeSession(found.user), isPending: false });
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(found.user.email));
    }
    return { error: null };
  },
  async social(_input: { provider: string }): Promise<{ error: { message: string } | null }> {
    await new Promise((r) => setTimeout(r, 400));
    return { error: { message: "Social sign-in isn't configured in this demo" } };
  },
};

export async function signOut(): Promise<void> {
  if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
  set({ session: null, isPending: false });
}
