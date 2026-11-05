import { serverApi } from "@/lib/api/server";
import { requirePermission } from "@/lib/auth/server-permissions";

import { RolesView } from "./roles-view";

export default async function RolesSettingsPage() {
  const { permissions } = await requirePermission("roles:read");
  const [roles, catalogue] = await Promise.all([serverApi.listRoles(), serverApi.permissionList()]);

  return (
    <RolesView roles={roles} catalogue={catalogue} canRename={permissions.has("roles:write")} />
  );
}
