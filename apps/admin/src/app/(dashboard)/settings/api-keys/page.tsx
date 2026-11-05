import { serverApi } from "@/lib/api/server";
import { getMyPermissions, requirePermission } from "@/lib/auth/server-permissions";
import { heldPermissions } from "@/lib/auth/oauth-flow";

import { ApiKeysView } from "./api-keys-view";

export default async function ApiKeysPage() {
  const { permissions } = await requirePermission("api_keys:read");
  const [keys, catalogue, mine] = await Promise.all([
    serverApi.listApiKeys(),
    serverApi.permissionList(),
    getMyPermissions(),
  ]);
  const held = new Set(heldPermissions(mine));

  return (
    <ApiKeysView
      keys={keys}
      permissions={catalogue.filter((p) => held.has(p.key))}
      catalogue={catalogue}
      canCreate={permissions.has("api_keys:write")}
      canRevoke={permissions.has("api_keys:delete")}
    />
  );
}
