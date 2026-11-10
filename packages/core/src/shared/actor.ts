import type { ContentId, Permission } from '../types/index.js';

export interface RoleRef {
  key: string;
  name: string;
  team: boolean;
}

export interface EffectivePermissions {
  has(permission: Permission, on?: ContentId): boolean;
  require(permission: Permission, on?: ContentId): void;
  anywhere(permission: Permission): boolean;
  where(permission: Permission): { org: boolean; content: ContentId[] };
  roleOn(on?: ContentId): RoleRef;
  isOwner(): boolean;
  isToken(): boolean;
}

export interface Actor {
  id: string;
  orgId: string;
  permissions: EffectivePermissions;
}
