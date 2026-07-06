import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { isManager } from "@/lib/roles";

// Bare /settings has no panel of its own — send managers to the org's General
// settings and everyone else to their account Profile.
export default async function SettingsPage() {
  const session = await getServerSession();
  const manager = session ? isManager(session.role) : false;
  redirect(manager ? "/settings/general" : "/settings/account");
}
