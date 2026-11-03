import { describe, expect, it, vi } from 'vitest';
import type { Actor } from '../shared/actor.js';
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
      async (_o: string, actor: Actor, communityId: string) =>
        actor.role === 'owner' || grants.includes(communityId),
    ),
    canOpenSpace: vi.fn(async (_o: string, _a: Actor, spaceId: string) => spaceId === 'spc_1'),
  };
  const content = {
    getCourse: async (_o: string, id: string) => (courses[id] ?? null) as never,
    getActivity: async (_o: string, id: string) => (activities[id] ?? null) as never,
    getDownload: async (_o: string, id: string) =>
      (id === 'dwn_1' ? { id, title: 'Verb tables', status: 'published' } : null) as never,
    getBundle: async (_o: string, id: string) =>
      (id === 'bun_1' ? { id, name: 'Everything' } : null) as never,
    listBundleItems: async () => [{ contentId: 'crs_1' }, { contentId: 'dwn_1' }] as never,
    getCommunity: async (_o: string, id: string) =>
      (id === 'cmy_1' ? { id, title: 'Spring cohort' } : null) as never,
    getSpace: async (_o: string, id: string) =>
      (id.startsWith('spc_')
        ? { id, name: id === 'spc_1' ? 'Practice' : 'Staff room' }
        : null) as never,
  };
  return { access, titles: new ContentItemTitles({ content, access }) };
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
    await expect(
      titles.titlesFor('org_1', { id: 'ou_sarah', role: 'student' }, refs),
    ).resolves.toEqual({
      'course:crs_1': { title: 'Spanish in 90 Days' },
      'activity:act_1': { title: 'Lesson 3' },
      'bundle:bun_1': { title: 'Everything' },
      'community:cmy_1': { title: 'Spring cohort' },
      'space:spc_1': { title: 'Practice' },
    });
  });

  it('returns nothing about content the member holds no grant for', async () => {
    const { titles } = build([]);
    const result = await titles.titlesFor('org_1', { id: 'ou_emma', role: 'student' }, refs);
    expect(result).toEqual({ 'space:spc_1': { title: 'Practice' } });
  });

  it('opens every course, activity, download and bundle to staff', async () => {
    const { titles, access } = build([]);
    const result = await titles.titlesFor('org_1', { id: 'ou_owner', role: 'owner' }, refs);
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
});
