import { redirect } from "next/navigation";

import { getPermissions } from "@/lib/auth/server-permissions";
import { requireAuth } from "@/lib/auth/server-session";

export default async function SettingsPage() {
  await requireAuth();
  const permissions = await getPermissions();
  redirect(permissions.has("organizations:read") ? "/settings/general" : "/settings/account");
}
