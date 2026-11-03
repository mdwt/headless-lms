import type { MentionItemType, MentionView } from '../types/index.js';
import { authorView } from './authors.js';
import type { AuthorProfileReader, MentionsRepository } from './ports.js';

const TOKEN = /<@([A-Za-z0-9_-]+)>/g;
const UNNAMED = 'A member';

export function mentionTokens(...texts: string[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(TOKEN)) {
      found.add(match[1]!);
    }
  }
  return [...found];
}

export function keepAllowed(tokens: string[], allowed: string[]): string[] {
  const kept = new Set(allowed);
  return tokens.filter((token) => kept.has(token));
}

export async function mentionViews(
  mentions: Pick<MentionsRepository, 'forItems'>,
  profiles: AuthorProfileReader,
  orgId: string,
  itemType: MentionItemType,
  itemIds: string[],
): Promise<Record<string, MentionView[]>> {
  if (itemIds.length === 0) {
    return {};
  }
  const byItem = await mentions.forItems(orgId, itemType, [...new Set(itemIds)]);
  const people = [...new Set(Object.values(byItem).flat())];
  const records = people.length > 0 ? await profiles.authorsOf(orgId, people) : {};
  return Object.fromEntries(
    Object.entries(byItem).map(([itemId, orgUserIds]) => [
      itemId,
      orgUserIds.flatMap((orgUserId) => {
        const record = records[orgUserId];
        return record
          ? [{ orgUserId, name: authorView(orgId, record, null).displayName || UNNAMED }]
          : [];
      }),
    ]),
  );
}
