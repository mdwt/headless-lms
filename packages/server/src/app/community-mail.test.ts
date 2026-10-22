import { describe, expect, it, vi } from 'vitest';
import type { Community, OrgUser } from '@headless-lms/core/types';
import { communityMail, type CommunityMailDeps } from './community-mail.js';

const orgUser = { id: 'ou_sarah', userId: 'usr_sarah', role: 'student' } as OrgUser;

const reject = async (): Promise<never> => {
  throw new Error('not expected');
};

function deps(over: Partial<CommunityMailDeps> = {}): CommunityMailDeps {
  return {
    content: { getCommunity: reject, getSpace: reject, listCommunitiesById: reject },
    entitlements: {
      openSpacesFor: reject,
      communitiesOpenedBy: reject,
      communityMembersAmong: reject,
      spaceOpenersAmong: reject,
      communityModeratorIds: reject,
      countActiveSpaceMembers: reject,
      communityIdsOpenedFor: reject,
      ensureGrant: reject,
      expireDue: reject,
      hasDueNotices: reject,
    },
    organizations: { getOrgUserById: reject, staffOrgUserIds: reject },
    identity: { displayName: reject },
    posts: { followerIds: reject, find: reject, publishDue: reject, hasDue: reject },
    discussion: { getComment: reject, sendDigest: reject },
    chats: { chatSummary: reject, latestMessageBody: reject, isBlocked: reject },
    assets: { removeUnattached: reject, hasUnattached: reject },
    ...over,
  };
}

function entitlements(
  over: Partial<CommunityMailDeps['entitlements']>,
): CommunityMailDeps['entitlements'] {
  return { ...deps().entitlements, ...over };
}

describe('communityMail', () => {
  it('asks entitlements for the open spaces of the org user as an actor', async () => {
    const openSpacesFor = vi.fn(async () => [{ name: 'SaaS founders' }] as never);
    const { mail } = communityMail(
      deps({
        organizations: { getOrgUserById: async () => orgUser, staffOrgUserIds: reject },
        entitlements: entitlements({ openSpacesFor }),
      }),
    );

    await expect(mail.openSpaceNames('org_1', 'ou_sarah', 'cmy_1')).resolves.toEqual([
      'SaaS founders',
    ]);
    expect(openSpacesFor).toHaveBeenCalledWith(
      'org_1',
      { id: 'ou_sarah', role: 'student' },
      'cmy_1',
    );
  });

  it('opens no space for an org user that does not exist', async () => {
    const { mail } = communityMail(
      deps({ organizations: { getOrgUserById: async () => null, staffOrgUserIds: reject } }),
    );

    await expect(mail.openSpaceNames('org_1', 'ou_gone', 'cmy_1')).resolves.toEqual([]);
  });

  it('lets identity name an org user that does not exist', async () => {
    const displayName = vi.fn(async (userId: string | null) => (userId ? 'Sarah' : 'A member'));
    const { mail } = communityMail(
      deps({
        organizations: { getOrgUserById: async () => null, staffOrgUserIds: reject },
        identity: { displayName },
      }),
    );

    await expect(mail.displayName('org_1', 'ou_gone')).resolves.toBe('A member');
    expect(displayName).toHaveBeenCalledWith(null);
  });

  it('reads the titles of the communities a member opens in one content call', async () => {
    const listCommunitiesById = vi.fn(async () => [
      { id: 'cmy_1', title: 'Founder Collab' } as Community,
    ]);
    const { mail } = communityMail(
      deps({
        content: { getCommunity: reject, getSpace: reject, listCommunitiesById },
        entitlements: entitlements({ communityIdsOpenedFor: async () => ['cmy_1'] }),
      }),
    );

    await expect(mail.memberCommunityTitles('org_1', 'ou_sarah')).resolves.toEqual([
      { id: 'cmy_1', title: 'Founder Collab' },
    ]);
    expect(listCommunitiesById).toHaveBeenCalledWith('org_1', ['cmy_1']);
  });

  it('grants through the idempotent grant and leaves the upload grace to assets', async () => {
    const ensureGrant = vi.fn(async () => ({}) as never);
    const removeUnattached = vi.fn(async () => 0);
    const { grants, scheduledWork } = communityMail(
      deps({
        entitlements: entitlements({ ensureGrant }),
        assets: { removeUnattached, hasUnattached: reject },
      }),
    );
    const now = new Date('2026-10-22T10:00:00Z');
    const input = { orgUserId: 'ou_sarah', contentId: 'cmy_1', expiresAt: null };

    await grants.grant('org_1', input);
    await scheduledWork.removeUnattachedUploads('org_1', now);

    expect(ensureGrant).toHaveBeenCalledWith('org_1', input);
    expect(removeUnattached).toHaveBeenCalledWith('org_1', now);
  });
});
