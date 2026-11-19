import { serverApi } from "@/lib/api/server";
import { requirePermission } from "@/lib/auth/server-permissions";

import { AppsView } from "./apps-view";

export default async function AppsPage() {
  const { permissions } = await requirePermission("organizations:read");
  const apps = await serverApi.listApps();

  return <AppsView apps={apps} canEdit={permissions.has("organizations:write")} />;
}
