import type { GetMyPermissionsResponse, ListPermissionsResponse } from "@headless-lms/sdk";

export type MyPermissions = GetMyPermissionsResponse;
export type Permission = MyPermissions["org"][number];
export type PermissionDefinition = ListPermissionsResponse[number];

export interface Permissions {
  orgRole: MyPermissions["orgRole"];
  isOwner: boolean;
  has(permission: Permission, contentId?: string): boolean;
  anywhere(permission: Permission): boolean;
  hasAny(permissions: Permission[], contentId?: string): boolean;
  anywhereAny(permissions: Permission[]): boolean;
  where(permission: Permission): { org: boolean; content: string[] };
  manages: boolean;
}

export function permissionsOf(data: MyPermissions): Permissions {
  const org = new Set<Permission>(data.org);
  const content = new Map(Object.entries(data.content).map(([id, list]) => [id, new Set(list)]));
  const has = (permission: Permission, contentId?: string) =>
    org.has(permission) ||
    (contentId !== undefined && (content.get(contentId)?.has(permission) ?? false));
  const where = (permission: Permission) => ({
    org: org.has(permission),
    content: [...content].filter(([, set]) => set.has(permission)).map(([id]) => id),
  });
  const anywhere = (permission: Permission) => {
    const w = where(permission);
    return w.org || w.content.length > 0;
  };
  return {
    orgRole: data.orgRole,
    isOwner: data.isOwner,
    has,
    anywhere,
    hasAny: (permissions, contentId) => permissions.some((p) => has(p, contentId)),
    anywhereAny: (permissions) => permissions.some(anywhere),
    where,
    manages: org.size > 0 || [...content.values()].some((set) => set.size > 0),
  };
}

export function permissionGroupLabel(group: string): string {
  return group.charAt(0).toUpperCase() + group.slice(1);
}

export function groupPermissions<T extends { key: Permission }>(
  definitions: PermissionDefinition[],
  items: T[],
): { group: string; label: string; items: (T & { definition: PermissionDefinition })[] }[] {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const groups = new Map<string, (T & { definition: PermissionDefinition })[]>();
  for (const definition of definitions) {
    const item = byKey.get(definition.key);
    if (!item) continue;
    const list = groups.get(definition.group) ?? [];
    list.push({ ...item, definition });
    groups.set(definition.group, list);
  }
  return [...groups].map(([group, list]) => ({
    group,
    label: permissionGroupLabel(group),
    items: list,
  }));
}
