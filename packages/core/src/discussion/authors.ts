import type { CommentAuthor } from './model.js';
import type { AuthorRecord } from './ports.js';

export function authorView(orgId: string, record: AuthorRecord): CommentAuthor {
  const fullName = [record.firstName, record.lastName].filter(Boolean).join(' ');
  return {
    id: record.id,
    firstName: record.firstName,
    lastName: record.lastName,
    displayName: record.displayName?.trim() || fullName || null,
    headline: record.headline,
    image: record.image,
    imageAssetId: record.imageAssetOrgId === orgId ? record.imageAssetId : null,
    role: record.role,
  };
}
