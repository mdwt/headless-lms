import type { Event } from '../../../content/index.js';
import type { ListBase } from './recipients.js';

export function eventBase(
  type: string,
  event: Event,
  actorId: string | null,
): Omit<ListBase, 'display'> {
  return {
    type,
    scope: 'org',
    actorId,
    communityId: null,
    spaceId: null,
    subject: { type: 'event', id: event.id },
    parent: null,
  };
}

export function eventDisplay(event: Event): Record<string, string> {
  return {
    eventTitle: event.title,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    timeZone: event.timeZone,
  };
}
