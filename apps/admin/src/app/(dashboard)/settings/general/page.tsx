import { serverApi } from "@/lib/api/server";
import { requirePermission } from "@/lib/auth/server-permissions";
import { SettingsSurface } from "@/components/forms/settings-section";
import { defaultOrgRole, givableOrgRoles } from "@/lib/org-roles";

import { GeneralView } from "./general-view";
import { TransferOwnership } from "./transfer-ownership";

export default async function GeneralSettingsPage() {
  const { session, permissions } = await requirePermission("organizations:read");
  const { name, slug } = session.organization;
  const [team, roles] = permissions.isOwner
    ? await Promise.all([serverApi.teamLite(), serverApi.listRoles()])
    : [[], []];
  const candidates = team.filter(
    (m) => !m.isOwner && m.email.toLowerCase() !== session.user.email.toLowerCase(),
  );
  const orgRoles = givableOrgRoles(roles);

  return (
    <SettingsSurface>
      <GeneralView name={name} slug={slug} canEdit={permissions.has("organizations:write")} />
      {permissions.isOwner ? (
        <TransferOwnership
          candidates={candidates}
          roles={orgRoles}
          defaultRoleKey={defaultOrgRole(roles)?.key ?? orgRoles[0]?.key ?? ""}
        />
      ) : null}
    </SettingsSurface>
  );
}
