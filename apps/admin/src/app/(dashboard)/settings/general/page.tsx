import { requireManager } from "@/lib/auth/server-session";

import { GeneralView } from "./general-view";

// Organization → General settings (manager-only): the active org's name and slug.
export default async function GeneralSettingsPage() {
  const session = await requireManager();
  const { name, slug } = session.organization;
  return <GeneralView name={name} slug={slug} />;
}
