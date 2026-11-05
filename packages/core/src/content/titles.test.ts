import { describe, expect, it, vi } from 'vitest';
import type { Actor } from '../shared/actor.js';
import { actorWith } from '../organizations/index.js';
import { ContentItemTitles } from './titles.js';

const courses: Record<string, { id: string; title: string; status: string }> = {
  crs_1: { id: 'crs_1', title: 'Spanish in 90 Days', status: 'published' },
  crs_draft: { id: 'crs_draft', title: 'Draft course', status: 'draft' },
};

const activities: Record<string, { id: string; courseId: string; settings: unknown }> = {
  act_1: { id: 'act_1', courseId: 'crs_1', settings: { title: 'Lesson 3' } },
  act_draft: {
    id: 'act_draft',
    courseId: 'crs_1',
    settings: { title: 'Lesson 4', published: false },
  },
};

function build(grants: string[]) {
  const access = {
    hasAccess: vi.fn(async (_o: string, _u: string, contentId: string) =>
      grants.includes(contentId),
    ),
    isCommunityMember: vi.fn(
      async (communityId: string, actor: Actor) =>
        actor.permissions.has('communities:read', communityId) || grants.includes(communityId),
    ),
    canOpenSpace: vi.fn(async (spaceId: string, _a: Actor) => spaceId === 'spc_1'),
  };
  const content = {
    getCourse: async (id: string) => (courses[id] ?? null) as never,
    getActivity: async (id: string) => (activities[id] ?? null) as never,
    getDownload: async (id: string) =>
      (id === 'dwn_1' ? { id, title: 'Verb tables', status: 'published' } : null) as never,
    getBundle: async (id: string) => (id === 'bun_1' ? { id, name: 'Everything' } : null) as never,
    listBundleItems: async () => [{ contentId: 'crs_1' }, { contentId: 'dwn_1' }] as never,
    getCommunity: async (id: string) =>
      (id === 'cmy_1' ? { id, title: 'Spring cohort' } : null) as never,
    getSpace: async (id: string) =>
      (id.startsWith('spc_')
        ? { id, name: id === 'spc_1' ? 'Practice' : 'Staff room' }
        : null) as never,
  };
  const organizations = { systemActor: (orgId: string) => actorWith({ owner: true, orgId }) };
  return { access, titles: new ContentItemTitles({ content, access, organizations }) };
}

const refs = [
  { type: 'course' as const, id: 'crs_1' },
  { type: 'course' as const, id: 'crs_draft' },
  { type: 'activity' as const, id: 'act_1' },
  { type: 'activity' as const, id: 'act_draft' },
  { type: 'download' as const, id: 'dwn_1' },
  { type: 'bundle' as const, id: 'bun_1' },
  { type: 'community' as const, id: 'cmy_1' },
  { type: 'space' as const, id: 'spc_1' },
  { type: 'space' as const, id: 'spc_2' },
  { type: 'post' as const, id: 'pst_1' },
];

describe('ContentItemTitles', () => {
  it('returns only the items a member can open', async () => {
    const { titles } = build(['crs_1', 'crs_draft', 'cmy_1']);
    await expect(titles.titlesFor(refs, actorWith({ id: 'ou_sarah' }))).resolves.toEqual({
      'course:crs_1': { title: 'Spanish in 90 Days' },
      'activity:act_1': { title: 'Lesson 3' },
      'bundle:bun_1': { title: 'Everything' },
      'community:cmy_1': { title: 'Spring cohort' },
      'space:spc_1': { title: 'Practice' },
    });
  });

  it('returns nothing about content the member holds no grant for', async () => {
    const { titles } = build([]);
    const result = await titles.titlesFor(refs, actorWith({ id: 'ou_emma' }));
    expect(result).toEqual({ 'space:spc_1': { title: 'Practice' } });
  });

  it('opens every course, activity, download and bundle to the holder of their read permissions', async () => {
    const { titles, access } = build([]);
    const result = await titles.titlesFor(refs, actorWith({ id: 'ou_owner', owner: true }));
    expect(Object.keys(result)).toEqual([
      'course:crs_1',
      'course:crs_draft',
      'activity:act_1',
      'activity:act_draft',
      'download:dwn_1',
      'bundle:bun_1',
      'community:cmy_1',
      'space:spc_1',
    ]);
    expect(access.hasAccess).not.toHaveBeenCalled();
  });

  it('opens a course and its lessons with courses:read on that course only', async () => {
    const { titles, access } = build([]);
    const james = actorWith({
      id: 'ou_james',
      content: { crs_draft: ['courses:read'] },
    });
    const result = await titles.titlesFor(
      [
        { type: 'course', id: 'crs_draft' },
        { type: 'course', id: 'crs_1' },
        { type: 'activity', id: 'act_draft' },
      ],
      james,
    );
    expect(result).toEqual({ 'course:crs_draft': { title: 'Draft course' } });
    expect(access.hasAccess).toHaveBeenCalledWith('org_1', 'ou_james', 'crs_1');
  });

  it('shows a download with downloads:read and a bundle name with bundles:read', async () => {
    const { titles } = build([]);
    const result = await titles.titlesFor(
      refs,
      actorWith({ org: ['bundles:read'], content: { dwn_1: ['downloads:read'] } }),
    );
    expect(result).toEqual({
      'download:dwn_1': { title: 'Verb tables' },
      'bundle:bun_1': { title: 'Everything' },
      'space:spc_1': { title: 'Practice' },
    });
  });
});
