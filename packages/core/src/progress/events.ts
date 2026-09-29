import { progressRecordSchema } from '../types/schemas/index.js';
import {
  defineEvent,
  type EventOf,
  type EventOfValues,
  type NewDomainEvent,
} from '../shared/ports.js';

const publicProgressRecord = progressRecordSchema
  .pick({
    id: true,
    orgId: true,
    orgUserId: true,
    targetType: true,
    targetId: true,
    startedAt: true,
    completedAt: true,
    createdAt: true,
    updatedAt: true,
  })
  .strip();

export const progressEvents = {
  progressStarted: defineEvent({
    type: 'progress.record.started',
    version: 1,
    data: progressRecordSchema,
    publicData: publicProgressRecord,
  }),
  progressCompleted: defineEvent({
    type: 'progress.record.completed',
    version: 1,
    data: progressRecordSchema,
    publicData: publicProgressRecord,
  }),
};

export type ProgressStarted = EventOf<typeof progressEvents.progressStarted>;
export type ProgressCompleted = EventOf<typeof progressEvents.progressCompleted>;
export type ProgressEvent = EventOfValues<typeof progressEvents>;
export type NewProgressEvent = NewDomainEvent<ProgressEvent>;
