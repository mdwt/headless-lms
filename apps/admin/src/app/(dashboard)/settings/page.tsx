import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { isManager } from "@/lib/roles";

// Bare /settings has no panel of its own — send managers to Team (the primary
// org surface) and everyone else to their Account tab.
export default async function SettingsPage() {
  const session = await getServerSession();
  const manager = session ? isManager(session.role) : false;
  redirect(manager ? "/settings/team" : "/settings/account");
}
