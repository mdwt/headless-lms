import { ForbiddenError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../../app/container.js';

export async function actorOf(container: Container, orgId: string, userId: string) {
  const orgUser = await container.organizations.getOrgUser(orgId, userId);
  if (!orgUser) {
    throw new ForbiddenError('You are not a member of this organization');
  }
  return orgUser;
}
