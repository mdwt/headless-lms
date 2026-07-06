import { requireAuth } from "@/lib/auth/server-session";

import { AccountView } from "./account-view";

// Account tab: the signed-in user's identity, active org, and sign-out. Reads
// the shared session (no extra fetch); the interactive bits live in the client view.
export default async function AccountPage() {
  await requireAuth();
  return <AccountView />;
}
