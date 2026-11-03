import { contentEvents } from '../../../content/index.js';
import type { RecipientRule } from '../../ports.js';
import { actorOr, eventAt, listOf, Reasons, recipientsOf } from './recipients.js';

const activityPublished: RecipientRule = async (event, reads) => {
  const parsed = contentEvents.activityPublished.safeParse(event);
  if (!parsed.success) {
    return [];
  }
  const { activityId, courseId } = parsed.data.data;
  const orgId = event.orgId;
  const activity = await reads.activity(orgId, activityId);
  if (!activity) {
    return [];
  }
  return listOf(
    {
      type: 'course.activity_added',
      scope: 'org',
      actorOrgUserId: actorOr(event, null),
      communityId: null,
      spaceId: null,
      subject: { type: 'activity', id: activityId },
      parent: { type: 'course', id: courseId },
      display: {
        courseTitle: activity.courseTitle,
        moduleTitle: activity.moduleTitle,
        activityTitle: activity.title,
      },
    },
    await recipientsOf(
      reads,
      orgId,
      new Reasons().add(await reads.courseHolders(orgId, courseId), 'course_member'),
      { exclude: [actorOr(event, null)], at: eventAt(event) },
    ),
  );
};

export const CONTENT_RULES: Record<string, RecipientRule> = {
  'content.course.activity.published': activityPublished,
};
