import { organizationEvents } from '../../../organizations/index.js';
import type { RecipientRule } from '../../ports.js';
import { actorOr, eventAt, listOf, Reasons, recipientsOf } from './recipients.js';

const orgUserUpdated: RecipientRule = async (event, reads) => {
  const parsed = organizationEvents.orgUserUpdated.safeParse(event);
  if (!parsed.success || parsed.data.data.role !== 'moderator') {
    return [];
  }
  const orgUser = parsed.data.data;
  const orgId = event.orgId;
  const communities = await reads.memberCommunityTitles(orgId, orgUser.id);
  return listOf(
    {
      type: 'moderator.assigned',
      scope: 'org',
      actorOrgUserId: actorOr(event, null),
      communityId: null,
      spaceId: null,
      subject: null,
      parent: null,
      display: { communityTitles: communities.map((community) => community.title) },
    },
    await recipientsOf(reads, orgId, new Reasons().add([orgUser.id], 'subject'), {
      exclude: [actorOr(event, null)],
      at: eventAt(event),
    }),
  );
};

export const ORGANIZATION_RULES: Record<string, RecipientRule> = {
  'organization.user.updated': orgUserUpdated,
};
