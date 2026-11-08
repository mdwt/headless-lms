import type { FileUrls } from '../../assets/index.js';
import { UNNAMED_MEMBER } from '../../identity/index.js';
import type { EventAttendee, EventAttendeeFace, EventAttendeeSource } from '../../types/index.js';

export interface EventAttendeeRow {
  orgUserId: string;
  displayName: string | null;
  imageAssetId: string | null;
  source: EventAttendeeSource;
  grantedAt: Date;
}

export type EventFaceRow = Pick<EventAttendeeRow, 'orgUserId' | 'displayName' | 'imageAssetId'>;

export interface EventFaces {
  total: number;
  rows: EventFaceRow[];
}

export interface EventReader {
  orgUserId: string;
  readAll: boolean;
  readIds: string[];
}

export function attendeeFace(
  orgId: string,
  row: EventFaceRow,
  fileUrls: Pick<FileUrls, 'publicImage'>,
): EventAttendeeFace {
  return {
    orgUserId: row.orgUserId,
    name: row.displayName ?? UNNAMED_MEMBER,
    avatarUrl: row.imageAssetId
      ? fileUrls.publicImage(orgId, row.orgUserId, row.imageAssetId)
      : null,
  };
}

export function attendeeView(
  orgId: string,
  row: EventAttendeeRow,
  fileUrls: Pick<FileUrls, 'publicImage'>,
): EventAttendee {
  return { ...attendeeFace(orgId, row, fileUrls), source: row.source, grantedAt: row.grantedAt };
}
