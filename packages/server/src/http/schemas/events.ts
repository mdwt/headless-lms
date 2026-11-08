import { z } from 'zod';
import {
  addEventAssetInputSchema,
  eventFileSchema,
  eventLocationSchema,
  eventRecordingSchema,
  eventSettingsSchema,
  eventSortSchema,
  eventStatusSchema,
  eventViewSchema,
  idSchema,
  reorderEventAssetsInputSchema,
  timeZoneSchema,
} from '@headless-lms/core/schemas';
import { DateTimeInput, ListQuery, paginated } from './shared.js';

export const EventStatus = eventStatusSchema;
export type EventStatus = z.infer<typeof EventStatus>;

export const Event = eventViewSchema;
export type Event = z.infer<typeof Event>;

export const EventFile = eventFileSchema;
export type EventFile = z.infer<typeof EventFile>;

const EventTitle = z.string().trim().min(1).max(120);
const EventDescription = z.string().max(5_000).describe('Markdown');

export const CreateEvent = z.object({
  title: EventTitle,
  description: EventDescription.default(''),
  startsAt: DateTimeInput,
  endsAt: DateTimeInput.describe('After `startsAt`'),
  timeZone: timeZoneSchema,
  location: eventLocationSchema
    .optional()
    .describe('A venue, a meeting link, both, or neither yet. Default: neither'),
  settings: eventSettingsSchema
    .partial()
    .optional()
    .describe('Any field left out takes its default'),
});
export type CreateEvent = z.infer<typeof CreateEvent>;

export const UpdateEvent = z.object({
  title: EventTitle.optional(),
  description: EventDescription.optional(),
  startsAt: DateTimeInput.optional(),
  endsAt: DateTimeInput.optional().describe('After `startsAt`'),
  timeZone: timeZoneSchema.optional(),
  location: eventLocationSchema.optional(),
  thumbnailAssetId: idSchema.nullable().optional().describe('The cover image; null clears it'),
  recording: eventRecordingSchema.nullable().optional().describe('Null clears it'),
  status: EventStatus.extract(['draft', 'published'])
    .optional()
    .describe('`published` publishes the event, `draft` unpublishes it'),
  settings: eventSettingsSchema.partial().optional().describe('Fields left out keep their value'),
});
export type UpdateEvent = z.infer<typeof UpdateEvent>;

export const EventsQuery = ListQuery.extend({
  status: EventStatus.optional(),
  from: DateTimeInput.optional().describe('Events that end after this time'),
  to: DateTimeInput.optional().describe('Events that start before this time'),
  sort: eventSortSchema.optional().describe('Default `startsAt`'),
});
export type EventsQuery = z.infer<typeof EventsQuery>;

export const EventsPage = paginated(Event);
export type EventsPage = z.infer<typeof EventsPage>;

export const AddEventAsset = addEventAssetInputSchema;
export type AddEventAsset = z.infer<typeof AddEventAsset>;

export const RenameEventAsset = z.object({
  displayName: z.string().trim().min(1).max(255).nullable(),
});
export type RenameEventAsset = z.infer<typeof RenameEventAsset>;

export const ReorderEventAssets = reorderEventAssetsInputSchema;
export type ReorderEventAssets = z.infer<typeof ReorderEventAssets>;

export const EventIdParam = z.object({ eventId: z.string() });
export type EventIdParam = z.infer<typeof EventIdParam>;

export const EventAssetParams = z.object({
  eventId: z.string(),
  assetId: z.string(),
});
export type EventAssetParams = z.infer<typeof EventAssetParams>;
