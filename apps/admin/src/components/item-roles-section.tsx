import "server-only";

import { serverApi } from "@/lib/api/server";
import type { ContentType } from "@/lib/api/types";
import { requirePermission } from "@/lib/auth/server-permissions";

import { ItemRolesPanel } from "./item-roles-panel";

export async function ItemRolesSection({
  contentId,
  contentType,
  contentNoun,
}: {
  contentId: string;
  contentType: ContentType;
  contentNoun: string;
}) {
  const { permissions } = await requirePermission("people:read");
  const canWrite = permissions.has("people:write");
  const [assignments, people, roles, memberIds] = await Promise.all([
    serverApi.rolesOn(contentId),
    serverApi.peopleLite(),
    permissions.has("roles:read") ? serverApi.listRoles() : Promise.resolve([]),
    contentType === "community"
      ? serverApi.communityMemberIds(contentId).then(
          (ids) => [...ids],
          () => null,
        )
      : Promise.resolve(null),
  ]);
  const byId = new Map(people.map((p) => [p.id, p]));
  const rows = assignments.map((a) => ({
    orgUserId: a.orgUserId,
    name: byId.get(a.orgUserId)?.name ?? "Unknown person",
    email: byId.get(a.orgUserId)?.email ?? "",
    roleKey: a.roleKey,
    roleName: a.roleName,
  }));

  return (
    <ItemRolesPanel
      contentId={contentId}
      contentType={contentType}
      contentNoun={contentNoun}
      rows={rows}
      roles={roles}
      people={people}
      canWrite={canWrite}
      memberIds={memberIds}
    />
  );
}
