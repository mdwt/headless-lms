import type { AssetUrls } from '../assets/index.js';
import type { CommentAuthor } from './model.js';
import type { AuthorRecord } from './ports.js';

function imageOf(orgId: string, record: AuthorRecord): string | null {
  return record.imageAssetOrgId === orgId ? record.imageAssetId : null;
}

export function authorImageIds(orgId: string, records: Iterable<AuthorRecord>): string[] {
  return [...records].flatMap((record) => {
    const imageAssetId = imageOf(orgId, record);
    return imageAssetId ? [imageAssetId] : [];
  });
}

export function authorView(orgId: string, record: AuthorRecord, urls: AssetUrls): CommentAuthor {
  const fullName = [record.firstName, record.lastName].filter(Boolean).join(' ');
  const imageAssetId = imageOf(orgId, record);
  return {
    id: record.id,
    firstName: record.firstName,
    lastName: record.lastName,
    displayName: record.displayName?.trim() || fullName || null,
    headline: record.headline,
    image: record.image,
    imageAssetId,
    imageUrl: imageAssetId ? (urls[imageAssetId] ?? null) : null,
    role: record.role,
  };
}
