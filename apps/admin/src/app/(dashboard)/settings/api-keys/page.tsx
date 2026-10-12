import { serverApi } from "@/lib/api/server";
import { requireAuth } from "@/lib/auth/server-session";

import { ApiKeysView } from "./api-keys-view";

export default async function ApiKeysPage() {
  const keysPromise = serverApi.listApiKeys();
  const optionsPromise = serverApi.listAccessScopes();
  await requireAuth(keysPromise, optionsPromise);
  const [keys, options] = await Promise.all([keysPromise, optionsPromise]);

  return (
    <ApiKeysView
      keys={keys}
      scopes={options.filter((option) => option.allowed).map((option) => option.scope)}
    />
  );
}
