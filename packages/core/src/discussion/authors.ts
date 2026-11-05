import type { FileUrls } from '../assets/index.js';
import type { CommentAuthor } from './model.js';
import type { AuthorRecord } from './ports.js';
import type { TeamBadge } from './rules.js';

function imageOf(orgId: string, record: AuthorRecord): string | null {
  return record.imageAssetOrgId === orgId ? record.imageAssetId : null;
}

export function authorName(record: AuthorRecord): string | null {
  const fullName = [record.firstName, record.lastName].filter(Boolean).join(' ');
  return record.displayName?.trim() || fullName || null;
}

export function authorView(
  orgId: string,
  record: AuthorRecord,
  fileUrls: FileUrls,
  badge: TeamBadge,
): CommentAuthor {
  const imageAssetId = imageOf(orgId, record);
  return {
    id: record.id,
    firstName: record.firstName,
    lastName: record.lastName,
    displayName: authorName(record),
    headline: record.headline,
    image: record.image,
    imageAssetId,
    imageUrl: imageAssetId ? fileUrls.personImage(record.id) : null,
    team: badge.team,
    roleName: badge.roleName,
  };
}
