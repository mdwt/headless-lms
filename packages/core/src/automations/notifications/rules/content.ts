import { contentEvents, type Event } from '../../../content/index.js';
import type { DomainEvent } from '../../../shared/ports.js';
import type { NotificationReads, RecipientRule } from '../../ports.js';
import { previousStatusOf } from '../../community-mail.js';
import { eventBase, eventDisplay } from './events.js';
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
      actorId: actorOr(event, null),
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
      new Reasons().add(await reads.courseMembers(orgId, courseId), 'course_member'),
      { exclude: [actorOr(event, null)], at: eventAt(event) },
    ),
  );
};

const LEAD_TEXT = { '1d': '1 day', '1h': '1 hour' } as const;

function metadataText(event: DomainEvent, key: string): string | undefined {
  const value = event.metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

function whatChanged(
  event: DomainEvent,
  next: Event,
): 'time' | 'location' | 'time_and_location' | null {
  const time =
    metadataText(event, 'previousStartsAt') !== next.startsAt.toISOString() ||
    metadataText(event, 'previousEndsAt') !== next.endsAt.toISOString();
  const location = event.metadata?.locationChanged === true;
  if (time && location) {
    return 'time_and_location';
  }
  return time ? 'time' : location ? 'location' : null;
}

async function toAttendees(
  reads: NotificationReads,
  domainEvent: DomainEvent,
  event: Event,
  type: string,
  actorId: string | null,
  display: Record<string, string>,
) {
  return listOf(
    { ...eventBase(type, event, actorId), display },
    await recipientsOf(
      reads,
      domainEvent.orgId,
      new Reasons().add(await reads.eventAttendees(domainEvent.orgId, event.id), 'event_member'),
      { exclude: [actorId], at: eventAt(domainEvent) },
    ),
  );
}

const eventUpdated: RecipientRule = async (domainEvent, reads) => {
  const parsed = contentEvents.eventUpdated.safeParse(domainEvent);
  if (!parsed.success) {
    return [];
  }
  const next = parsed.data.data;
  const event = await reads.event(domainEvent.orgId, next.id);
  if (!event?.settings.notifications) {
    return [];
  }
  const actor = actorOr(domainEvent, null);
  const previousStatus = previousStatusOf(domainEvent);
  if (next.status === 'canceled' && previousStatus !== 'canceled') {
    return toAttendees(reads, domainEvent, event, 'event.canceled', actor, eventDisplay(next));
  }
  if (
    previousStatus !== 'published' ||
    next.status !== 'published' ||
    next.endsAt.getTime() <= eventAt(domainEvent).getTime()
  ) {
    return [];
  }
  const changed = whatChanged(domainEvent, next);
  if (!changed) {
    return [];
  }
  return toAttendees(reads, domainEvent, event, 'event.changed', actor, {
    ...eventDisplay(next),
    changed,
  });
};

const eventStartingSoon: RecipientRule = async (domainEvent, reads) => {
  const parsed = contentEvents.eventStartingSoon.safeParse(domainEvent);
  if (!parsed.success) {
    return [];
  }
  const { eventId, lead } = parsed.data.data;
  const event = await reads.event(domainEvent.orgId, eventId);
  if (!event?.settings.notifications || event.status !== 'published') {
    return [];
  }
  return toAttendees(reads, domainEvent, event, 'event.starting_soon', null, {
    ...eventDisplay(event),
    leadText: LEAD_TEXT[lead],
  });
};

export const CONTENT_RULES: Record<string, RecipientRule> = {
  'content.course.activity.published': activityPublished,
  'content.event.updated': eventUpdated,
  'content.event.starting_soon': eventStartingSoon,
};
