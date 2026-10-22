import { describe, expect, it, vi } from 'vitest';
import type { ContentService } from '@headless-lms/core/content';
import type { Community } from '@headless-lms/core/types';
import { listCommunityIds } from './community-mail.js';

const community = (id: string): Community =>
  ({
    id,
  }) as Community;

describe('listCommunityIds', () => {
  it('asks only for published communities', async () => {
    const listCommunities = vi.fn<ContentService['listCommunities']>(async (_orgId, query) => ({
      rows: query.status === 'published' ? [community('cmy_1')] : [community('cmy_draft')],
      total: 1,
      page: query.page,
      pageSize: query.pageSize,
    }));

    await expect(listCommunityIds({ listCommunities }, 'org_1')).resolves.toEqual(['cmy_1']);
    expect(listCommunities).toHaveBeenCalledWith('org_1', {
      page: 1,
      pageSize: 100,
      status: 'published',
    });
  });
});
