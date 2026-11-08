import { organizationEvents } from '../../../organizations/index.js';
import { roleGain } from '../../community-mail.js';
import type { RecipientRule } from '../../ports.js';
import { actorOr, eventAt, listOf, Reasons, recipientsOf } from './recipients.js';

const roleAssigned: RecipientRule = async (event, reads) => {
  const parsed = organizationEvents.roleAssigned.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const assigned = parsed.data.data;
  const orgId = event.orgId;
  const gain = await roleGain(reads, orgId, assigned);
  if (!gain) {
    return [];
  }
  return listOf(
    {
      type: 'role.assigned',
      scope: 'org',
      actorId: actorOr(event, null),
      communityId: null,
      spaceId: null,
      subject: null,
      parent: null,
      display: {
        roleName: gain.roleName,
        place: gain.place,
        contentId: gain.contentId,
        contentType: gain.contentType,
      },
    },
    await recipientsOf(reads, orgId, new Reasons().add([assigned.orgUserId], 'subject'), {
      exclude: [actorOr(event, null)],
      at: eventAt(event),
    }),
  );
};

export const ORGANIZATION_RULES: Record<string, RecipientRule> = {
  'organization.role.assigned': roleAssigned,
};
