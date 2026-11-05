import { describe, expect, it, vi } from 'vitest';
import type { AuthorRecord } from './ports.js';
import { keepAllowed, mentionTokens, mentionViews, nameMentions } from './mentions.js';

function record(id: string, over: Partial<AuthorRecord> = {}): AuthorRecord {
  return {
    id,
    firstName: null,
    lastName: null,
    email: `${id}@example.test`,
    image: null,
    displayName: null,
    headline: null,
    imageAssetOrgId: null,
    imageAssetId: null,
    ...over,
  };
}

describe('mentionTokens', () => {
  it('reads each <@orgUserId> token once, in order, across the texts', () => {
    expect(
      mentionTokens('Great take, <@orm_2ab9>', 'and <@orm_77> with <@orm_2ab9> again'),
    ).toEqual(['orm_2ab9', 'orm_77']);
  });

  it('ignores text that is not a whole token', () => {
    expect(mentionTokens('<@> <orm_1> @orm_2 <@orm 3> <@orm_4', 'email@x.com')).toEqual([]);
    expect(mentionTokens('')).toEqual([]);
  });
});

describe('keepAllowed', () => {
  it('keeps the tokens in their order that the allowed list holds', () => {
    expect(keepAllowed(['ou_3', 'ou_1', 'ou_2'], ['ou_1', 'ou_3'])).toEqual(['ou_3', 'ou_1']);
    expect(keepAllowed(['ou_1'], [])).toEqual([]);
  });
});

describe('nameMentions', () => {
  it('replaces each token with the person name, once per person', async () => {
    const nameOf = vi.fn(async (id: string) => (id === 'ou_1' ? 'Sarah' : 'James'));
    await expect(nameMentions('Hi <@ou_1> and <@ou_2>, <@ou_1>', nameOf)).resolves.toBe(
      'Hi Sarah and James, Sarah',
    );
    expect(nameOf).toHaveBeenCalledTimes(2);
  });
});

describe('mentionViews', () => {
  it('names each mentioned person when read, skipping anyone who is gone', async () => {
    const views = await mentionViews(
      {
        forItems: async () => ({ pst_1: ['ou_sarah', 'ou_gone', 'ou_james'], pst_2: ['ou_emma'] }),
      },
      {
        authorsOf: async (_orgId, ids) =>
          Object.fromEntries(
            ids
              .filter((id) => id !== 'ou_gone')
              .map((id) => [
                id,
                id === 'ou_sarah'
                  ? record(id, { displayName: 'Sarah' })
                  : id === 'ou_james'
                    ? record(id, { firstName: 'James', lastName: 'Lee' })
                    : record(id),
              ]),
          ),
      },
      'org_1',
      'post',
      ['pst_1', 'pst_2', 'pst_1'],
    );
    expect(views).toEqual({
      pst_1: [
        { orgUserId: 'ou_sarah', name: 'Sarah' },
        { orgUserId: 'ou_james', name: 'James Lee' },
      ],
      pst_2: [{ orgUserId: 'ou_emma', name: 'A member' }],
    });
  });

  it('reads nothing for no items', async () => {
    const views = await mentionViews(
      {
        forItems: async () => {
          throw new Error('not expected');
        },
      },
      {
        authorsOf: async () => {
          throw new Error('not expected');
        },
      },
      'org_1',
      'comment',
      [],
    );
    expect(views).toEqual({});
  });
});
