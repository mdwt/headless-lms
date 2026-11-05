import type { ContentId, Permission, Role } from '../types/index.js';

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
}

export interface Actor {
  id: string;
  role: Role;
}
