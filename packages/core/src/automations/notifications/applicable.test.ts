import { describe, expect, it } from 'vitest';
import { actorWith } from '../../organizations/index.js';
import { applicableCategories } from './applicable.js';
import { DEFAULT_COMMUNITY_CATEGORIES, DEFAULT_ORG_CATEGORIES } from './defaults.js';

const keys = (categories: { key: string }[]) => categories.map((category) => category.key);

describe('applicableCategories', () => {
  it('leaves the review category out for a member who moderates nothing', () => {
    const oliver = actorWith().permissions;
    expect(
      keys(applicableCategories(DEFAULT_COMMUNITY_CATEGORIES, oliver, { communityId: 'cmy_1' })),
    ).not.toContain('review');
    expect(keys(applicableCategories(DEFAULT_ORG_CATEGORIES, oliver, 'org'))).not.toContain(
      'review',
    );
    expect(keys(applicableCategories(DEFAULT_ORG_CATEGORIES, oliver, 'org'))).toContain(
      'about_you',
    );
  });

  it('shows review in the community Emma moderates and not in another', () => {
    const emma = actorWith({ content: { cmy_1: ['communities:moderate'] } }).permissions;
    expect(
      keys(applicableCategories(DEFAULT_COMMUNITY_CATEGORIES, emma, { communityId: 'cmy_1' })),
    ).toContain('review');
    expect(
      keys(applicableCategories(DEFAULT_COMMUNITY_CATEGORIES, emma, { communityId: 'cmy_2' })),
    ).not.toContain('review');
  });

  it('shows the org review category to whoever moderates a course', () => {
    const james = actorWith({ content: { crs_1: ['courses:moderate'] } }).permissions;
    expect(keys(applicableCategories(DEFAULT_ORG_CATEGORIES, james, 'org'))).toContain('review');
  });
});
