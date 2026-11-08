import { describe, expect, it, vi } from 'vitest';
import type { Community } from '@headless-lms/core/types';
import { actorWith } from '@headless-lms/core/organizations';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import { PlainBodyParser } from '@headless-lms/adapter-defaults/body';
import { communityMail, type CommunityMailDeps } from './community-mail.js';

const SYSTEM = actorWith({ id: 'system', orgId: 'org_1', owner: true });
const SARAH = actorWith({ id: 'ou_sarah', orgId: 'org_1' });

const reject = async (): Promise<never> => {
  throw new Error('not expected');
};

function deps(over: Partial<CommunityMailDeps> = {}): CommunityMailDeps {
  return {
    content: {
      findCommunity: reject,
      getSpace: reject,
      listCommunitiesById: reject,
      findCourse: reject,
      findDownload: reject,
      findEvent: reject,
      findBundle: reject,
    },
    entitlements: {
      openSpacesFor: reject,
      communitiesOpenedBy: reject,
      communityMembersAmong: reject,
      spaceOpenersAmong: reject,
      spaceOpeners: reject,
      countActiveSpaceMembers: reject,
      communityIdsOpenedFor: reject,
      ensureGrant: reject,
    },
    organizations: {
      getById: reject,
      getOrgUserById: reject,
      actorFor: reject,
      systemActor: () => SYSTEM,
      holders: reject,
      getRole: reject,
      permissionsOfMany: reject,
    },
    identity: { displayName: reject },
    posts: { find: reject },
    subscriptions: { followerIds: reject, itemSubscriptions: reject },
    discussion: { getComment: reject },
    chats: { chatSummary: reject, latestMessageBody: reject, isBlocked: reject },
    bodies: new PlainBodyParser(),
    ...over,
  };
}

function organizations(
  over: Partial<CommunityMailDeps['organizations']>,
): CommunityMailDeps['organizations'] {
  return { ...deps().organizations, ...over };
}

function content(over: Partial<CommunityMailDeps['content']>): CommunityMailDeps['content'] {
  return { ...deps().content, ...over };
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
        organizations: organizations({ actorFor: async () => SARAH }),
        entitlements: entitlements({ openSpacesFor }),
      }),
    );

    await expect(mail.openSpaceNames('org_1', 'ou_sarah', 'cmy_1')).resolves.toEqual([
      'SaaS founders',
    ]);
    expect(openSpacesFor).toHaveBeenCalledWith('cmy_1', SARAH);
  });

  it('opens no space for an org user that does not exist', async () => {
    const { mail } = communityMail(
      deps({ organizations: organizations({ actorFor: async () => null }) }),
    );

    await expect(mail.openSpaceNames('org_1', 'ou_gone', 'cmy_1')).resolves.toEqual([]);
  });

  it('lets identity name an org user that does not exist', async () => {
    const displayName = vi.fn(async (userId: string | null) => (userId ? 'Sarah' : 'A member'));
    const { mail } = communityMail(
      deps({
        organizations: organizations({ getOrgUserById: async () => null }),
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
        content: content({ listCommunitiesById }),
        entitlements: entitlements({ communityIdsOpenedFor: async () => ['cmy_1'] }),
      }),
    );

    await expect(mail.memberCommunityTitles('org_1', 'ou_sarah')).resolves.toEqual([
      { id: 'cmy_1', title: 'Founder Collab' },
    ]);
    expect(listCommunitiesById).toHaveBeenCalledWith(['cmy_1'], SYSTEM);
  });

  it("reads a post body's text through the body parser", () => {
    const parse = vi.fn(() => ({ text: 'Plain words', mentions: [], assetIds: [] }));
    const { mail } = communityMail(deps({ bodies: { parse } }));
    expect(mail.postText('**Plain** words')).toBe('Plain words');
    expect(parse).toHaveBeenCalledWith('**Plain** words');
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

    expect(ensureGrant).toHaveBeenCalledWith(input, SYSTEM);
  });

  it('reads content titles as the system actor', async () => {
    const getCommunity = vi.fn(async () => ({ title: 'Spring cohort' }) as never);
    const getSpace = vi.fn(
      async () => ({ name: 'Practice', communityId: 'cmy_1', capacity: null }) as never,
    );
    const { mail } = communityMail(
      deps({ content: content({ findCommunity: getCommunity, getSpace }) }),
    );

    await expect(mail.communityTitle('org_1', 'cmy_1')).resolves.toBe('Spring cohort');
    await expect(mail.space('org_1', 'spc_1')).resolves.toEqual({
      name: 'Practice',
      communityId: 'cmy_1',
      capacity: null,
    });
    expect(getCommunity).toHaveBeenCalledWith('cmy_1', SYSTEM);
    expect(getSpace).toHaveBeenCalledWith('spc_1', SYSTEM);
  });

  it('names the content item or bundle', async () => {
    const { mail } = communityMail(
      deps({
        content: content({
          findBundle: async () => ({ name: 'All access' }) as never,
          findCourse: async () => null,
          findDownload: async () => null,
          findCommunity: async () => ({ title: 'Spring cohort', type: 'community' }) as never,
        }),
      }),
    );

    await expect(mail.contentInfo('org_1', { bundleId: 'bnd_1' })).resolves.toEqual({
      title: 'All access',
      type: 'bundle',
    });
    await expect(mail.contentInfo('org_1', { contentId: 'cmy_1' })).resolves.toEqual({
      title: 'Spring cohort',
      type: 'community',
    });
  });

  it('reads a role as the system actor and answers null for a role the org lacks', async () => {
    const getRole = vi.fn(async (key: string) => {
      if (key === 'gone') {
        throw new NotFoundError('Role', key);
      }
      return { name: 'Tutor', permissions: ['courses:write'] } as never;
    });
    const { mail } = communityMail(deps({ organizations: organizations({ getRole }) }));

    await expect(mail.role('org_1', 'instructor')).resolves.toEqual({
      name: 'Tutor',
      permissions: ['courses:write'],
    });
    await expect(mail.role('org_1', 'gone')).resolves.toBeNull();
    expect(getRole).toHaveBeenCalledWith('instructor', SYSTEM);
  });

  it('asks organizations for the holders of a permission', async () => {
    const holders = vi.fn(async () => ['ou_emma']);
    const { mail } = communityMail(deps({ organizations: organizations({ holders }) }));

    await expect(mail.holders('org_1', 'communities:moderate', 'cmy_1')).resolves.toEqual([
      'ou_emma',
    ]);
    expect(holders).toHaveBeenCalledWith('org_1', 'communities:moderate', 'cmy_1');
  });
});
