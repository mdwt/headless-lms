import type { ContentId, Permission } from '../types/index.js';
import type { Actor, RoleRef } from '../shared/actor.js';
import { ALL_PERMISSIONS, withImplied } from './permissions.js';
import { ResolvedPermissions } from './effective-permissions.js';

export interface ActorShape {
  id?: string;
  orgId?: string;
  org?: readonly Permission[];
  content?: Readonly<Record<ContentId, readonly Permission[]>>;
  owner?: boolean;
  orgRole?: RoleRef;
  contentRoles?: Readonly<Record<ContentId, RoleRef>>;
}

const MEMBER: RoleRef = { key: 'member', name: 'Member', team: false };

export function actorWith(shape: ActorShape = {}): Actor {
  const org = shape.owner ? new Set(ALL_PERMISSIONS) : withImplied(shape.org ?? []);
  const content = new Map(
    Object.entries(shape.content ?? {}).map(([id, permissions]) => [
      id,
      {
        permissions: withImplied(permissions),
        role: shape.contentRoles?.[id] ?? { key: 'item_role', name: 'Item role', team: true },
      },
    ]),
  );
  const orgRole =
    shape.orgRole ??
    (shape.owner
      ? { key: 'owner', name: 'Owner', team: true }
      : (shape.org?.length ?? 0) > 0
        ? { key: 'org_role', name: 'Org role', team: true }
        : MEMBER);
  return {
    id: shape.id ?? 'orm_actor',
    orgId: shape.orgId ?? 'org_1',
    permissions: new ResolvedPermissions(org, orgRole, content, shape.owner ?? false),
  };
}
