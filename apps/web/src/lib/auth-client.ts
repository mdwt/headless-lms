import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

// Points at the API origin. `credentials: "include"` so the session cookie is
// sent cross-origin (the API's CORS config allows credentials).
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3000",
  fetchOptions: { credentials: "include" },
  plugins: [magicLinkClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
