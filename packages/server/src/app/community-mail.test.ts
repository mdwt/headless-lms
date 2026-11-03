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
      spaceOpeners: reject,
      communityModeratorIds: reject,
      countActiveSpaceMembers: reject,
      communityIdsOpenedFor: reject,
      ensureGrant: reject,
    },
    organizations: { getOrgUserById: reject, staffOrgUserIds: reject },
    identity: { displayName: reject },
    posts: { find: reject },
    subscriptions: { followerIds: reject, itemSubscriptions: reject },
    discussion: { getComment: reject },
    chats: { chatSummary: reject, latestMessageBody: reject, isBlocked: reject },
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

  it('reads followers from the post subscriptions', async () => {
    const followerIds = vi.fn(async () => ['ou_emma']);
    const { mail } = communityMail(
      deps({ subscriptions: { followerIds, itemSubscriptions: reject } }),
    );

    await expect(mail.followerIds('org_1', 'pst_1')).resolves.toEqual(['ou_emma']);
    expect(followerIds).toHaveBeenCalledWith('org_1', 'pst_1');
  });

  it("reads each chat participant's mute from the chat's subscriptions", async () => {
    const at = new Date('2026-01-01T00:00:00Z');
    const until = new Date('2030-01-01T00:00:00Z');
    const participant = (orgUserId: string) => ({ orgUserId, leftAt: null }) as never;
    const itemSubscriptions = vi.fn(async () => [
      {
        orgId: 'org_1',
        orgUserId: 'ou_james',
        itemType: 'chat' as const,
        itemId: 'cht_1',
        state: 'muted' as const,
        mutedUntil: until,
        createdAt: at,
      },
      {
        orgId: 'org_1',
        orgUserId: 'ou_emma',
        itemType: 'chat' as const,
        itemId: 'cht_1',
        state: 'muted' as const,
        mutedUntil: null,
        createdAt: at,
      },
    ]);
    const { mail } = communityMail(
      deps({
        subscriptions: { followerIds: reject, itemSubscriptions },
        chats: {
          chatSummary: async () => ({
            chat: {
              communityId: 'cmy_1',
              kind: 'group',
              status: 'open',
              createdBy: 'ou_sarah',
            } as never,
            participants: [
              participant('ou_sarah'),
              participant('ou_james'),
              participant('ou_emma'),
            ],
          }),
          latestMessageBody: reject,
          isBlocked: reject,
        },
      }),
    );

    const chat = await mail.chat('org_1', 'cht_1');
    expect(chat?.participants).toEqual([
      { orgUserId: 'ou_sarah', muted: false, mutedUntil: null, leftAt: null },
      { orgUserId: 'ou_james', muted: true, mutedUntil: until, leftAt: null },
      { orgUserId: 'ou_emma', muted: true, mutedUntil: null, leftAt: null },
    ]);
    expect(itemSubscriptions).toHaveBeenCalledWith('org_1', { type: 'chat', id: 'cht_1' });
  });

  it('grants through the idempotent grant', async () => {
    const ensureGrant = vi.fn(async () => ({}) as never);
    const { grants } = communityMail(deps({ entitlements: entitlements({ ensureGrant }) }));
    const input = { orgUserId: 'ou_sarah', contentId: 'cmy_1', expiresAt: null };

    await grants.grant('org_1', input);

    expect(ensureGrant).toHaveBeenCalledWith('org_1', input);
  });
});
