import { canModerate, type Role } from '../organizations/index.js';
import type { SpaceAccessRule } from './ports.js';
import type { SpaceMemberStatus } from './model.js';

export function opensSpace(
  role: Role,
  member: boolean,
  accessRule: SpaceAccessRule,
  activeInSpace: boolean,
): boolean {
  if (!member) {
    return false;
  }
  return canModerate(role) || accessRule === 'all_members' || activeInSpace;
}

export function seesSpace(
  role: Role,
  accessRule: SpaceAccessRule,
  status: SpaceMemberStatus | undefined,
): boolean {
  return (
    canModerate(role) ||
    accessRule !== 'by_invite' ||
    (status !== undefined && status !== 'revoked')
  );
}

export function laterExpiry(a: Date | null, b: Date | null): Date | null {
  if (a === null || b === null) {
    return null;
  }
  return a.getTime() >= b.getTime() ? a : b;
}
