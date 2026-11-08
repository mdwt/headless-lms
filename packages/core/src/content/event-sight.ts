import type { Event } from '../types/index.js';

export type EventSight = 'read' | 'attendee' | 'public';

export function eventSight(
  event: Pick<Event, 'status' | 'settings'>,
  viewer: { canRead: boolean; attending: boolean },
): EventSight | null {
  if (viewer.canRead) {
    return 'read';
  }
  if (viewer.attending && (event.status === 'published' || event.status === 'canceled')) {
    return 'attendee';
  }
  if (event.status === 'published' && event.settings.type === 'public') {
    return 'public';
  }
  return null;
}
