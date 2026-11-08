import { entitlementEvents } from '../../../entitlements/index.js';
import type { DomainEvent } from '../../../shared/ports.js';
import type { RecipientList, SubjectRef } from '../../../types/index.js';
import { communityModerators, previousStatusOf } from '../../community-mail.js';
import type { NotificationReads, RecipientRule } from '../../ports.js';
import { actorOr, eventAt, listOf, Reasons, recipientsOf } from './recipients.js';

type Grant = { orgUserId: string; contentId: string | null; bundleId: string | null };
type SpaceMember = { spaceId: string; communityId: string; orgUserId: string; status: string };

function seatsLeft(capacity: number | null, active: number): string {
  return capacity == null ? 'No cap' : String(Math.max(capacity - active, 0));
}

function subjectOnly(event: DomainEvent, reads: NotificationReads, orgUserId: string) {
  return recipientsOf(reads, event.orgId, new Reasons().add([orgUserId], 'subject'), {
    exclude: [actorOr(event, null)],
    at: eventAt(event),
  });
}

async function grantSubject(
  reads: NotificationReads,
  orgId: string,
  grant: Grant,
): Promise<{ ref: SubjectRef; title: string; type: string } | null> {
  if (grant.bundleId) {
    const info = await reads.contentInfo(orgId, { bundleId: grant.bundleId });
    return info ? { ref: { type: 'bundle', id: grant.bundleId }, ...info } : null;
  }
  if (!grant.contentId) {
    return null;
  }
  const info = await reads.contentInfo(orgId, { contentId: grant.contentId });
  if (!info) {
    return null;
  }
  const type: SubjectRef['type'] =
    info.type === 'download' ? 'download' : info.type === 'community' ? 'community' : 'course';
  return { ref: { type, id: grant.contentId }, ...info };
}

async function membershipEnded(
  event: DomainEvent,
  reads: NotificationReads,
  grant: Grant,
  ref: SubjectRef | null,
): Promise<RecipientList[] | null> {
  const orgId = event.orgId;
  const communityIds = await reads.communitiesOpenedBy(orgId, grant);
  if (communityIds.length === 0) {
    return null;
  }
  const held = new Set(
    (await reads.memberCommunityTitles(orgId, grant.orgUserId)).map((community) => community.id),
  );
  const communities: { communityId: string; communityTitle: string }[] = [];
  for (const communityId of communityIds.filter((id) => !held.has(id))) {
    const title = await reads.communityTitle(orgId, communityId);
    if (title !== null) {
      communities.push({ communityId, communityTitle: title });
    }
  }
  if (communities.length === 0) {
    return null;
  }
  return listOf(
    {
      type: 'community.membership_ended',
      scope: 'org',
      actorId: actorOr(event, null),
      communityId: null,
      spaceId: null,
      subject: ref,
      parent: null,
      display: { communities },
    },
    await subjectOnly(event, reads, grant.orgUserId),
  );
}

async function spaceBase(
  reads: NotificationReads,
  orgId: string,
  member: SpaceMember,
  type: string,
  actorId: string | null,
) {
  const space = await reads.space(orgId, member.spaceId);
  return space
    ? {
        space,
        base: {
          type,
          scope: 'space' as const,
          actorId,
          communityId: member.communityId,
          spaceId: member.spaceId,
          subject: { type: 'space' as const, id: member.spaceId },
          parent: null,
        },
      }
    : null;
}

const spaceMemberCreated: RecipientRule = async (event, reads) => {
  const parsed = entitlementEvents.spaceMemberCreated.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const member = parsed.data.data;
  const orgId = event.orgId;
  if (member.status === 'requested') {
    const found = await spaceBase(reads, orgId, member, 'space.join_requested', member.orgUserId);
    if (!found) {
      return [];
    }
    const active = await reads.activeMemberCount(orgId, member.spaceId);
    return listOf(
      {
        ...found.base,
        display: {
          spaceName: found.space.name,
          spaceId: member.spaceId,
          memberName: await reads.displayName(orgId, member.orgUserId),
          seatsLeft: seatsLeft(found.space.capacity, active),
        },
      },
      await recipientsOf(
        reads,
        orgId,
        new Reasons().add(await communityModerators(reads, orgId, member.communityId), 'moderator'),
        {
          exclude: [member.orgUserId, actorOr(event, null)],
          at: eventAt(event),
          canOpen: (orgUserIds) => reads.spaceOpenersAmong(orgId, member.spaceId, orgUserIds),
        },
      ),
    );
  }
  if (member.status === 'invited') {
    const inviter = actorOr(event, null);
    const found = await spaceBase(reads, orgId, member, 'space.invited', inviter);
    if (!found) {
      return [];
    }
    return listOf(
      {
        ...found.base,
        display: {
          spaceName: found.space.name,
          spaceId: member.spaceId,
          inviterName: inviter ? await reads.displayName(orgId, inviter) : 'A member',
        },
      },
      await subjectOnly(event, reads, member.orgUserId),
    );
  }
  return [];
};

const spaceMemberUpdated: RecipientRule = async (event, reads) => {
  const parsed = entitlementEvents.spaceMemberUpdated.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const member = parsed.data.data;
  if (member.status !== 'active' || previousStatusOf(event) !== 'requested') {
    return [];
  }
  const found = await spaceBase(
    reads,
    event.orgId,
    member,
    'space.request_approved',
    actorOr(event, null),
  );
  return found
    ? listOf(
        { ...found.base, display: { spaceName: found.space.name, spaceId: member.spaceId } },
        await subjectOnly(event, reads, member.orgUserId),
      )
    : [];
};

const spaceMemberDeleted: RecipientRule = async (event, reads) => {
  const parsed = entitlementEvents.spaceMemberDeleted.safeParse(event);
  if (!parsed.success || previousStatusOf(event) !== 'requested') {
    return [];
  }
  const member = parsed.data.data;
  const found = await spaceBase(
    reads,
    event.orgId,
    member,
    'space.request_declined',
    actorOr(event, null),
  );
  return found
    ? listOf(
        { ...found.base, display: { spaceName: found.space.name, spaceId: member.spaceId } },
        await subjectOnly(event, reads, member.orgUserId),
      )
    : [];
};

const entitlementCreated: RecipientRule = async (event, reads) => {
  const parsed = entitlementEvents.entitlementCreated.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const grant = parsed.data.data;
  const orgId = event.orgId;
  const actor = actorOr(event, null);
  const subject = await subjectOnly(event, reads, grant.orgUserId);
  if (subject.length === 0) {
    return [];
  }
  const lists: RecipientList[] = [];
  const target = await grantSubject(reads, orgId, grant);
  if (target) {
    lists.push(
      ...listOf(
        {
          type: 'access.granted',
          scope: 'org',
          actorId: actor,
          communityId: null,
          spaceId: null,
          subject: target.ref,
          parent: null,
          display: { contentTitle: target.title, contentType: target.type },
        },
        subject,
      ),
    );
  }
  for (const communityId of await reads.communitiesOpenedBy(orgId, grant)) {
    const title = await reads.communityTitle(orgId, communityId);
    if (title === null) {
      continue;
    }
    lists.push(
      ...listOf(
        {
          type: 'community.welcome',
          scope: 'community',
          actorId: actor,
          communityId,
          spaceId: null,
          subject: { type: 'community', id: communityId },
          parent: null,
          display: {
            communityTitle: title,
            spaceNames: await reads.openSpaceNames(orgId, grant.orgUserId, communityId),
          },
        },
        subject,
      ),
    );
  }
  return lists;
};

const entitlementEndingSoon: RecipientRule = async (event, reads) => {
  const parsed = entitlementEvents.entitlementEndingSoon.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const grant = parsed.data.data;
  const title = await reads.communityTitle(event.orgId, grant.communityId);
  if (title === null) {
    return [];
  }
  return listOf(
    {
      type: 'community.ending_soon',
      scope: 'community',
      actorId: null,
      communityId: grant.communityId,
      spaceId: null,
      subject: { type: 'community', id: grant.communityId },
      parent: null,
      display: {
        communityTitle: title,
        expiresAt: grant.expiresAt ? grant.expiresAt.toISOString() : '',
      },
    },
    await subjectOnly(event, reads, grant.orgUserId),
  );
};

const entitlementDeleted: RecipientRule = async (event, reads) => {
  const parsed = entitlementEvents.entitlementDeleted.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const grant = parsed.data.data;
  const target = await grantSubject(reads, event.orgId, grant);
  const ended = await membershipEnded(event, reads, grant, target?.ref ?? null);
  if (ended) {
    return ended;
  }
  if (!target || (await reads.contentLostBy(event.orgId, grant)).length === 0) {
    return [];
  }
  return listOf(
    {
      type: 'access.revoked',
      scope: 'org',
      actorId: actorOr(event, null),
      communityId: null,
      spaceId: null,
      subject: target.ref,
      parent: null,
      display: { contentTitle: target.title },
    },
    await subjectOnly(event, reads, grant.orgUserId),
  );
};

const entitlementExpired: RecipientRule = async (event, reads) => {
  const parsed = entitlementEvents.entitlementExpired.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const grant = parsed.data.data;
  const target = await grantSubject(reads, event.orgId, grant);
  return (await membershipEnded(event, reads, grant, target?.ref ?? null)) ?? [];
};

export const ENTITLEMENT_RULES: Record<string, RecipientRule> = {
  'entitlement.space_member.created': spaceMemberCreated,
  'entitlement.space_member.updated': spaceMemberUpdated,
  'entitlement.space_member.deleted': spaceMemberDeleted,
  'entitlement.created': entitlementCreated,
  'entitlement.ending_soon': entitlementEndingSoon,
  'entitlement.deleted': entitlementDeleted,
  'entitlement.expired': entitlementExpired,
};
