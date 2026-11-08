import {
  AddEventAsset,
  AddEventAttendee,
  CreateEvent,
  EventAssetParams,
  EventAttendeeParams,
  EventIdParam,
  EventsQuery,
  PageQuery,
  RenameEventAsset,
  ReorderEventAssets,
  UpdateEvent,
} from '../../schemas/index.js';
import { defineTool, type Tool } from '../tool.js';

export const eventTools: Tool[] = [
  defineTool({
    name: 'list_events',
    title: 'List events',
    description:
      'Search and page through events: live sessions at a set time, drafts and canceled ones included. Filter by status, or by a from and to date-time range the event overlaps.',
    operation: 'content.listEvents',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: EventsQuery,
    call: (input, { container, caller }) => container.content.listEvents(input, caller.actor),
  }),
  defineTool({
    name: 'get_event',
    title: 'Get event',
    description:
      'One event with its times, time zone, location, recording and settings: event type, capacity, notifications and replay.',
    operation: 'content.getEvent',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: EventIdParam,
    call: ({ eventId }, { container, caller }) => container.content.getEvent(eventId, caller.actor),
  }),
  defineTool({
    name: 'create_event',
    title: 'Create event',
    description:
      'Create a draft event. startsAt and endsAt are date-times, timeZone an IANA name. Publish it with update_event.',
    operation: 'content.createEvent',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: CreateEvent,
    call: (input, { container, caller }) => container.content.createEvent(input, caller.actor),
  }),
  defineTool({
    name: 'update_event',
    title: 'Update event',
    description:
      'Change an event title, description, times, location, cover image, recording or settings, or publish and unpublish it with status. Fields left out stay as they are. A canceled event cannot change.',
    operation: 'content.updateEvent',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateEvent.extend(EventIdParam.shape),
    call: ({ eventId, ...patch }, { container, caller }) =>
      container.content.updateEvent(eventId, patch, caller.actor),
  }),
  defineTool({
    name: 'cancel_event',
    title: 'Cancel event',
    description: 'Cancel an event and tell its attendees. Canceling is final.',
    operation: 'content.cancelEvent',
    kind: 'destructive',
    idempotent: false,
    openWorld: false,
    input: EventIdParam,
    call: ({ eventId }, { container, caller }) =>
      container.content.cancelEvent(eventId, caller.actor),
  }),
  defineTool({
    name: 'delete_event',
    title: 'Delete event',
    description: 'Permanently delete an event. The uploaded files are kept.',
    operation: 'content.deleteEvent',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: EventIdParam,
    call: ({ eventId }, { container, caller }) =>
      container.content.deleteEvent(eventId, caller.actor),
  }),
  defineTool({
    name: 'list_event_attendees',
    title: 'List event attendees',
    description:
      'The people attending an event, directly or through a bundle, by grant date, each with how they got their place: self, manual, automation or bundle.',
    operation: 'reporting.admin.eventAttendees',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: PageQuery.extend(EventIdParam.shape),
    call: ({ eventId, ...page }, { container, caller }) =>
      container.reporting.admin.eventAttendees(eventId, page, caller.actor),
  }),
  defineTool({
    name: 'get_event_analytics',
    title: 'Get event analytics',
    description:
      'Attendance figures for one event: attendees now and by source, capacity, revoked grants, and grants over time before the start.',
    operation: 'reporting.admin.eventAnalytics',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: EventIdParam,
    call: ({ eventId }, { container, caller }) =>
      container.reporting.admin.eventAnalytics(eventId, caller.actor),
  }),
  defineTool({
    name: 'add_event_attendee',
    title: 'Add event attendee',
    description:
      'Grant an event to a person (orgUserId) so they attend it. The event must be published, not ended and not full. Adding someone who already attends changes nothing.',
    operation: 'entitlements.grant',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: AddEventAttendee.extend(EventIdParam.shape),
    call: ({ eventId, orgUserId }, { container, caller }) =>
      container.entitlements.grant(
        { orgUserId, contentId: eventId, contentType: 'event', expiresAt: null },
        caller.actor,
      ),
  }),
  defineTool({
    name: 'remove_event_attendee',
    title: 'Remove event attendee',
    description:
      "Revoke a person's direct grant to an event. Someone who attends only through a bundle keeps attending.",
    operation: 'entitlements.revoke',
    kind: 'destructive',
    idempotent: false,
    openWorld: false,
    input: EventAttendeeParams,
    call: ({ eventId, orgUserId }, { container, caller }) =>
      container.entitlements.revoke(
        { orgUserId, contentId: eventId, contentType: 'event' },
        caller.actor,
      ),
  }),
  defineTool({
    name: 'list_event_files',
    title: 'List event files',
    description: 'The files attached to an event, in order, with their display names.',
    operation: 'content.listEventAssets',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: EventIdParam,
    call: ({ eventId }, { container, caller }) =>
      container.content.listEventAssets(eventId, caller.actor),
  }),
  defineTool({
    name: 'add_event_file',
    title: 'Add file to event',
    description: 'Attach an uploaded file to the end of an event. Find file ids with list_media.',
    operation: 'content.addEventAsset',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: AddEventAsset.extend(EventIdParam.shape),
    call: ({ eventId, ...file }, { container, caller }) =>
      container.content.addEventAsset(eventId, file, caller.actor),
  }),
  defineTool({
    name: 'rename_event_file',
    title: 'Rename event file',
    description: 'Set the name a file shows under in an event. null shows the file name.',
    operation: 'content.renameEventAsset',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: RenameEventAsset.extend(EventAssetParams.shape),
    call: ({ eventId, assetId, displayName }, { container, caller }) =>
      container.content.renameEventAsset(eventId, assetId, displayName, caller.actor),
  }),
  defineTool({
    name: 'reorder_event_files',
    title: 'Reorder event files',
    description:
      'Set the file order of an event. Pass every file id attached to the event in the new order.',
    operation: 'content.reorderEventAssets',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: ReorderEventAssets.extend(EventIdParam.shape),
    call: ({ eventId, assetIds }, { container, caller }) =>
      container.content.reorderEventAssets(eventId, assetIds, caller.actor),
  }),
  defineTool({
    name: 'remove_event_file',
    title: 'Remove file from event',
    description: 'Take a file off an event. The uploaded file itself is kept.',
    operation: 'content.removeEventAsset',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: EventAssetParams,
    call: ({ eventId, assetId }, { container, caller }) =>
      container.content.removeEventAsset(eventId, assetId, caller.actor),
  }),
];
