import { serverApi } from "@/lib/api/server";
import { requirePermission } from "@/lib/auth/server-permissions";

import { ApiKeysView } from "./api-keys-view";

export default async function ApiKeysPage() {
  const { permissions } = await requirePermission("api_keys:read");
  const canCreate = permissions.has("api_keys:write");
  const [keys, roles] = await Promise.all([
    serverApi.listApiKeys(),
    canCreate ? serverApi.listApiKeyRoles() : Promise.resolve([]),
  ]);

  return (
    <ApiKeysView
      keys={keys}
      roles={roles}
      canCreate={canCreate}
      canRevoke={permissions.has("api_keys:delete")}
    />
  );
}
