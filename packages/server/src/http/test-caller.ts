import type { Actor } from '@headless-lms/core/shared/actor';
import type { ResolvedCaller } from '@headless-lms/core/organizations';

export function resolvedCaller<
  O extends { id: string },
  U extends { id: string },
  M extends { id: string },
>(org: O | null, user: U | null, orgUser: M | null, actor: Actor | null): ResolvedCaller | null {
  if (!org) {
    return null;
  }
  return {
    orgId: org.id,
    userId: user?.id ?? null,
    orgUserId: user && orgUser ? orgUser.id : null,
    actor: user && orgUser ? actor : null,
  };
}
