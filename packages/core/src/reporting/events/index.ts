import type { FileUrls } from '../../assets/index.js';
import { UNNAMED_MEMBER } from '../../identity/index.js';
import type {
  EventAttendee,
  EventAttendeeFace,
  EventAttendeeSource,
} from '../../types/index.js';

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
  row: EventFaceRow,
  fileUrls: Pick<FileUrls, 'personImage'>,
): EventAttendeeFace {
  return {
    orgUserId: row.orgUserId,
    name: row.displayName ?? UNNAMED_MEMBER,
    avatarUrl: row.imageAssetId ? fileUrls.personImage(row.orgUserId) : null,
  };
}

export function attendeeView(
  row: EventAttendeeRow,
  fileUrls: Pick<FileUrls, 'personImage'>,
): EventAttendee {
  return { ...attendeeFace(row, fileUrls), source: row.source, grantedAt: row.grantedAt };
}
