import { progressEvents } from '../../../progress/index.js';
import type { RecipientRule } from '../../ports.js';
import { eventAt, listOf, Reasons, recipientsOf } from './recipients.js';

const recordCompleted: RecipientRule = async (event, reads) => {
  const parsed = progressEvents.progressCompleted.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const record = parsed.data.data;
  if (record.targetType !== 'course') {
    return [];
  }
  const orgId = event.orgId;
  const course = await reads.contentInfo(orgId, { contentId: record.targetId });
  if (!course) {
    return [];
  }
  return listOf(
    {
      type: 'course.completed',
      scope: 'org',
      actorId: null,
      communityId: null,
      spaceId: null,
      subject: { type: 'course', id: record.targetId },
      parent: null,
      display: { courseTitle: course.title },
    },
    await recipientsOf(reads, orgId, new Reasons().add([record.orgUserId], 'subject'), {
      exclude: [],
      at: eventAt(event),
    }),
  );
};

export const PROGRESS_RULES: Record<string, RecipientRule> = {
  'progress.record.completed': recordCompleted,
};
