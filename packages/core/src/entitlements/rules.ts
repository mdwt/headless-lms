import type { SpaceAccessRule } from './ports.js';
import type { SpaceMemberStatus } from './model.js';

export function opensSpace(
  member: boolean,
  everySpace: boolean,
  accessRule: SpaceAccessRule,
  activeInSpace: boolean,
): boolean {
  if (!member) {
    return false;
  }
  return everySpace || accessRule === 'all_members' || activeInSpace;
}

export function seesSpace(
  everySpace: boolean,
  accessRule: SpaceAccessRule,
  status: SpaceMemberStatus | undefined,
): boolean {
  return everySpace || accessRule !== 'by_invite' || (status !== undefined && status !== 'revoked');
}

export function laterExpiry(a: Date | null, b: Date | null): Date | null {
  if (a === null || b === null) {
    return null;
  }
  return a.getTime() >= b.getTime() ? a : b;
}
