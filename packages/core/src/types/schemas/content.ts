import { z } from 'zod';
import { assetUrlsSchema } from './assets.js';
import { activityCommentsRuleSchema, commentSettingsSchema } from './discussion.js';
import { idSchema, jsonValueSchema } from './shared.js';

export const contentTypeSchema = z.enum(['course', 'download', 'community', 'event']);
export type ContentType = z.infer<typeof contentTypeSchema>;

export const courseStatusSchema = z.enum(['draft', 'published']);
export type CourseStatus = z.infer<typeof courseStatusSchema>;

export const courseSettingsSchema = z
  .object({
    transcriptDownloads: z.boolean(),
    comments: commentSettingsSchema.optional(),
  })
  .strict();
export type CourseSettings = z.infer<typeof courseSettingsSchema>;

/** Defaults for keys a stored settings row doesn't carry (or no row at all). */
export const courseSettingsDefaults: CourseSettings = { transcriptDownloads: false };

export const activitySettingsSchema = z
  .object({
    comments: activityCommentsRuleSchema.optional(),
  })
  .strict();
export type ActivitySettings = z.infer<typeof activitySettingsSchema>;

export const bundleSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    name: z.string(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Bundle = z.output<typeof bundleSchema>;
export type BundleInput = z.input<typeof bundleSchema>;

export const bundleItemSchema = z
  .object({
    orgId: idSchema,
    bundleId: idSchema,
    contentId: idSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type BundleItem = z.output<typeof bundleItemSchema>;
export type BundleItemInput = z.input<typeof bundleItemSchema>;

export const listBundlesQuerySchema = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    search: z.string().optional(),
    sort: z.string().optional(),
  })
  .strict();
export type ListBundlesQuery = z.infer<typeof listBundlesQuerySchema>;

export const createBundleInputSchema = z
  .object({
    name: z.string(),
    /** Content to put in the bundle at creation — bundle and items land together. */
    contentIds: z.array(idSchema).optional(),
  })
  .strict();
export type CreateBundleInput = z.infer<typeof createBundleInputSchema>;

export const updateBundleInputSchema = z
  .object({
    name: z.string().optional(),
  })
  .strict();
export type UpdateBundleInput = z.infer<typeof updateBundleInputSchema>;

export const contentItemSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    type: contentTypeSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type ContentItem = z.output<typeof contentItemSchema>;
export type ContentItemInput = z.input<typeof contentItemSchema>;

export const courseSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    type: z.literal('course'),
    title: z.string(),
    slug: z.string(),
    description: z.string(),
    status: courseStatusSchema,
    category: z.string(),
    thumbnailAssetId: idSchema.nullable(),
    settings: courseSettingsSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Course = z.output<typeof courseSchema>;

export const courseViewSchema = courseSchema
  .extend({ thumbnailUrl: z.string().nullable() })
  .strict();
export type CourseView = z.output<typeof courseViewSchema>;

export const activitySchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    moduleId: idSchema,
    courseId: idSchema,
    seq: z.number().int().min(0),
    settings: jsonValueSchema.nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Activity = z.output<typeof activitySchema>;
export type ActivityInput = z.input<typeof activitySchema>;

export const activityViewSchema = activitySchema.extend({ assetUrls: assetUrlsSchema }).strict();
export type ActivityView = z.output<typeof activityViewSchema>;

export const moduleSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    courseId: idSchema,
    title: z.string(),
    seq: z.number().int().min(0),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Module = z.output<typeof moduleSchema>;
export type ModuleInput = z.input<typeof moduleSchema>;

export const activityAssetSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    activityId: idSchema,
    assetId: idSchema,
    seq: z.number().int(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type ActivityAsset = z.output<typeof activityAssetSchema>;
export type ActivityAssetInput = z.input<typeof activityAssetSchema>;

export const saveActivityInputSchema = z
  .object({
    settings: jsonValueSchema.optional(),
    assetIds: z.array(idSchema).optional(),
  })
  .strict();
export type SaveActivityInput = z.infer<typeof saveActivityInputSchema>;

export const listCoursesQuerySchema = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    search: z.string().optional(),
    sort: z.string().optional(),
    status: courseStatusSchema.optional(),
    category: z.string().optional(),
  })
  .strict();
export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;

export const createCourseInputSchema = z
  .object({
    title: z.string(),
    description: z.string().optional(),
    category: z.string().optional(),
  })
  .strict();
export type CreateCourseInput = z.infer<typeof createCourseInputSchema>;

export const updateCourseInputSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    status: courseStatusSchema.optional(),
    thumbnailAssetId: idSchema.nullable().optional(),
  })
  .strict();
export type UpdateCourseInput = z.infer<typeof updateCourseInputSchema>;

export const downloadStatusSchema = z.enum(['draft', 'published']);
export type DownloadStatus = z.infer<typeof downloadStatusSchema>;

export const downloadSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    type: z.literal('download'),
    title: z.string(),
    slug: z.string(),
    description: z.string(),
    status: downloadStatusSchema,
    category: z.string(),
    thumbnailAssetId: idSchema.nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Download = z.output<typeof downloadSchema>;
export type DownloadInput = z.input<typeof downloadSchema>;

export const downloadViewSchema = downloadSchema
  .extend({ thumbnailUrl: z.string().nullable() })
  .strict();
export type DownloadView = z.output<typeof downloadViewSchema>;

export const downloadAssetSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    downloadId: idSchema,
    assetId: idSchema,
    seq: z.number().int(),
    displayName: z.string().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type DownloadAsset = z.output<typeof downloadAssetSchema>;
export type DownloadAssetInput = z.input<typeof downloadAssetSchema>;

export const downloadFileSchema = downloadAssetSchema
  .extend({
    filename: z.string(),
    contentType: z.string(),
    size: z.number().int().min(0),
    url: z.string(),
  })
  .strict();
export type DownloadFile = z.output<typeof downloadFileSchema>;

export const listDownloadsQuerySchema = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    search: z.string().optional(),
    sort: z.string().optional(),
    status: downloadStatusSchema.optional(),
    category: z.string().optional(),
  })
  .strict();
export type ListDownloadsQuery = z.infer<typeof listDownloadsQuerySchema>;

export const createDownloadInputSchema = z
  .object({
    title: z.string(),
    description: z.string().optional(),
    category: z.string().optional(),
  })
  .strict();
export type CreateDownloadInput = z.infer<typeof createDownloadInputSchema>;

export const updateDownloadInputSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    status: downloadStatusSchema.optional(),
    thumbnailAssetId: idSchema.nullable().optional(),
  })
  .strict();
export type UpdateDownloadInput = z.infer<typeof updateDownloadInputSchema>;

export const addDownloadAssetInputSchema = z
  .object({
    assetId: idSchema,
    displayName: z.string().optional(),
  })
  .strict();
export type AddDownloadAssetInput = z.infer<typeof addDownloadAssetInputSchema>;

export const reorderDownloadAssetsInputSchema = z
  .object({
    assetIds: z.array(idSchema).max(500),
  })
  .strict();
export type ReorderDownloadAssetsInput = z.infer<typeof reorderDownloadAssetsInputSchema>;

export const communityStatusSchema = z.enum(['draft', 'published']);
export type CommunityStatus = z.infer<typeof communityStatusSchema>;

export const dmSettingsSchema = z
  .object({
    enabled: z.boolean(),
    memberToMember: z.boolean(),
    memberToTeam: z.boolean(),
    teamToAnyone: z.boolean(),
    firstMessageIsRequest: z.boolean(),
    groupChats: z.boolean(),
    groupSize: z.number().int().min(1),
  })
  .strict();
export type DmSettings = z.infer<typeof dmSettingsSchema>;

export const dmSettingsDefaults: DmSettings = {
  enabled: true,
  memberToMember: true,
  memberToTeam: true,
  teamToAnyone: true,
  firstMessageIsRequest: true,
  groupChats: true,
  groupSize: 8,
};

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const digestCadenceSchema = z.enum(['daily', 'weekly']);
export type DigestCadence = z.infer<typeof digestCadenceSchema>;

export const digestScheduleSchema = z
  .object({
    cadence: digestCadenceSchema,
    weekday: z
      .number()
      .int()
      .min(0)
      .max(6)
      .describe('The day a weekly digest goes out, 0 is Sunday; a daily digest ignores it'),
    hour: z.number().int().min(0).max(23).describe('The hour of the day it goes out, 0–23'),
    timeZone: z
      .string()
      .refine(isTimeZone, { message: 'must be an IANA time zone' })
      .describe('The IANA time zone the weekday and hour are in, such as `Europe/Madrid`'),
  })
  .strict();
export type DigestSchedule = z.infer<typeof digestScheduleSchema>;

export const communitySettingsSchema = z
  .object({
    dm: dmSettingsSchema,
    digest: digestScheduleSchema.nullable(),
  })
  .strict();
export type CommunitySettings = z.infer<typeof communitySettingsSchema>;

export const communitySettingsDefaults: CommunitySettings = {
  dm: dmSettingsDefaults,
  digest: null,
};

export const communitySchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    type: z.literal('community'),
    title: z.string(),
    slug: z.string(),
    description: z.string(),
    status: communityStatusSchema,
    thumbnailAssetId: idSchema.nullable(),
    settings: communitySettingsSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Community = z.output<typeof communitySchema>;

export const communityViewSchema = communitySchema
  .extend({ thumbnailUrl: z.string().nullable() })
  .strict();
export type CommunityView = z.output<typeof communityViewSchema>;

export const spaceAccessRuleSchema = z.enum(['all_members', 'by_request', 'by_invite']);
export type SpaceAccessRule = z.infer<typeof spaceAccessRuleSchema>;

export const spaceSettingsSchema = z
  .object({
    comments: z.boolean(),
    reactions: z.boolean(),
    requireReview: z.boolean(),
  })
  .strict();
export type SpaceSettings = z.infer<typeof spaceSettingsSchema>;

export const spaceSettingsDefaults: SpaceSettings = {
  comments: true,
  reactions: true,
  requireReview: false,
};

export const spaceSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    communityId: idSchema,
    name: z.string(),
    description: z.string(),
    seq: z.number().int(),
    accessRule: spaceAccessRuleSchema,
    capacity: z.number().int().nullable(),
    settings: spaceSettingsSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Space = z.output<typeof spaceSchema>;

export const spaceTopicSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    spaceId: idSchema,
    name: z.string(),
    seq: z.number().int(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type SpaceTopic = z.output<typeof spaceTopicSchema>;

export const spaceLinkSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    spaceId: idSchema,
    contentId: idSchema,
    seq: z.number().int(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type SpaceLink = z.output<typeof spaceLinkSchema>;

export const spaceDetailSchema = spaceSchema.extend({
  topics: z.array(spaceTopicSchema),
  links: z.array(spaceLinkSchema),
});
export type SpaceDetail = z.output<typeof spaceDetailSchema>;

export const listCommunitiesQuerySchema = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    search: z.string().optional(),
    sort: z.string().optional(),
    status: communityStatusSchema.optional(),
  })
  .strict();
export type ListCommunitiesQuery = z.infer<typeof listCommunitiesQuerySchema>;

export const createCommunityInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5_000).optional(),
  })
  .strict();
export type CreateCommunityInput = z.infer<typeof createCommunityInputSchema>;

export const updateCommunityInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5_000).optional(),
    status: communityStatusSchema.optional(),
    thumbnailAssetId: idSchema.nullable().optional(),
  })
  .strict();
export type UpdateCommunityInput = z.infer<typeof updateCommunityInputSchema>;

export const patchDmSettingsInputSchema = dmSettingsSchema
  .extend({
    groupSize: z
      .number()
      .int()
      .min(3)
      .max(100)
      .describe('The most people a group chat may hold, its creator included'),
  })
  .partial();
export type PatchDmSettingsInput = z.infer<typeof patchDmSettingsInputSchema>;

export const patchCommunitySettingsInputSchema = patchDmSettingsInputSchema.extend({
  digest: digestScheduleSchema
    .nullable()
    .optional()
    .describe('When the community digest goes out; null stops it'),
});
export type PatchCommunitySettingsInput = z.infer<typeof patchCommunitySettingsInputSchema>;

export const createSpaceInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2_000).optional(),
    accessRule: spaceAccessRuleSchema.optional(),
    capacity: z.number().int().min(0).nullable().optional(),
    settings: spaceSettingsSchema.partial().optional(),
  })
  .strict();
export type CreateSpaceInput = z.infer<typeof createSpaceInputSchema>;

export const updateSpaceInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2_000).optional(),
    accessRule: spaceAccessRuleSchema.optional(),
    capacity: z.number().int().min(0).nullable().optional(),
    settings: spaceSettingsSchema.partial().optional(),
  })
  .strict();
export type UpdateSpaceInput = z.infer<typeof updateSpaceInputSchema>;

export const setSpaceTopicsInputSchema = z
  .object({
    topics: z
      .array(
        z
          .object({
            id: idSchema.optional().describe('Keep an existing topic; omit to add a new one'),
            name: z.string().trim().min(1).max(60),
          })
          .strict(),
      )
      .max(50)
      .describe('The complete list, in order. A topic left out is deleted'),
  })
  .strict();
export type SetSpaceTopicsInput = z.infer<typeof setSpaceTopicsInputSchema>;

export const addSpaceLinkInputSchema = z
  .object({
    contentId: idSchema,
  })
  .strict();
export type AddSpaceLinkInput = z.infer<typeof addSpaceLinkInputSchema>;

export const timeZoneSchema = z
  .string()
  .refine(isTimeZone, { message: 'must be an IANA time zone' })
  .describe('An IANA time zone, such as `Europe/London`');

const httpUrlSchema = z.url({ protocol: /^https?$/ });

export const eventStatusSchema = z.enum(['draft', 'published', 'canceled']);
export type EventStatus = z.infer<typeof eventStatusSchema>;

export const eventTypeSchema = z.enum(['public', 'private']);
export type EventType = z.infer<typeof eventTypeSchema>;

const addressLineSchema = z.string().max(200).nullable();

export const eventAddressSchema = z
  .object({
    line1: addressLineSchema,
    line2: addressLineSchema,
    city: addressLineSchema,
    region: addressLineSchema,
    postalCode: addressLineSchema,
    country: z
      .string()
      .regex(/^[A-Z]{2}$/, 'must be an ISO 3166-1 alpha-2 code')
      .nullable()
      .describe('An ISO 3166-1 alpha-2 code, such as `GB`'),
  })
  .strict();
export type EventAddress = z.infer<typeof eventAddressSchema>;

export const eventVenueSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    address: eventAddressSchema.nullable(),
  })
  .strict();
export type EventVenue = z.infer<typeof eventVenueSchema>;

export const eventOnlineSchema = z
  .object({
    url: httpUrlSchema.describe('The meeting link, `http` or `https`'),
    details: z.string().max(1_000).nullable().describe('Such as a passcode or a dial-in number'),
  })
  .strict();
export type EventOnline = z.infer<typeof eventOnlineSchema>;

export const eventLocationSchema = z
  .object({
    venue: eventVenueSchema.nullable().describe('Where the event takes place in person'),
    online: eventOnlineSchema.nullable().describe('How to join online'),
  })
  .strict();
export type EventLocation = z.infer<typeof eventLocationSchema>;

export const eventLocationDefaults: EventLocation = { venue: null, online: null };

export const eventRecordingSchema = z
  .object({
    url: httpUrlSchema.describe('Where the recording is, `http` or `https`'),
    details: z.string().max(1_000).nullable().describe('Such as a passcode'),
  })
  .strict();
export type EventRecording = z.infer<typeof eventRecordingSchema>;

export const eventSettingsSchema = z
  .object({
    type: eventTypeSchema.describe(
      '`public`: members register themselves. `private`: by grant only',
    ),
    capacity: z
      .number()
      .int()
      .min(1)
      .nullable()
      .describe('The most attendees the event takes; null means no limit'),
    notifications: z.boolean().describe('When false, no notifications are sent for the event'),
    replay: z.boolean().describe('When true, attendees get the recording after the end'),
  })
  .strict();
export type EventSettings = z.infer<typeof eventSettingsSchema>;

export const eventSettingsDefaults: EventSettings = {
  type: 'public',
  capacity: null,
  notifications: true,
  replay: true,
};

export const eventSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    type: z.literal('event'),
    title: z.string(),
    description: z.string(),
    thumbnailAssetId: idSchema.nullable(),
    status: eventStatusSchema,
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    timeZone: z.string(),
    location: eventLocationSchema,
    recording: eventRecordingSchema.nullable(),
    settings: eventSettingsSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Event = z.output<typeof eventSchema>;

export const eventViewSchema = eventSchema.extend({ thumbnailUrl: z.string().nullable() }).strict();
export type EventView = z.output<typeof eventViewSchema>;

export const eventAssetSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    eventId: idSchema,
    assetId: idSchema,
    seq: z.number().int(),
    displayName: z.string().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type EventAsset = z.output<typeof eventAssetSchema>;

export const eventFileSchema = eventAssetSchema
  .extend({
    filename: z.string(),
    contentType: z.string(),
    size: z.number().int().min(0),
    url: z.string(),
  })
  .strict();
export type EventFile = z.output<typeof eventFileSchema>;

export const eventSortSchema = z.enum(['startsAt', '-startsAt', 'title', '-title']);
export type EventSort = z.infer<typeof eventSortSchema>;

export const listEventsQuerySchema = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    search: z.string().optional(),
    sort: eventSortSchema.optional(),
    status: eventStatusSchema.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict();
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;

export const createEventInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().max(5_000).optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    timeZone: timeZoneSchema,
    location: eventLocationSchema.optional(),
    settings: eventSettingsSchema.partial().optional(),
  })
  .strict();
export type CreateEventInput = z.infer<typeof createEventInputSchema>;

export const updateEventInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(5_000).optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    timeZone: timeZoneSchema.optional(),
    location: eventLocationSchema.optional(),
    thumbnailAssetId: idSchema.nullable().optional(),
    recording: eventRecordingSchema.nullable().optional(),
    status: eventStatusSchema.extract(['draft', 'published']).optional(),
    settings: eventSettingsSchema.partial().optional(),
  })
  .strict();
export type UpdateEventInput = z.infer<typeof updateEventInputSchema>;

export const addEventAssetInputSchema = z
  .object({
    assetId: idSchema,
    displayName: z.string().optional(),
  })
  .strict();
export type AddEventAssetInput = z.infer<typeof addEventAssetInputSchema>;

export const reorderEventAssetsInputSchema = z
  .object({
    assetIds: z.array(idSchema).max(500),
  })
  .strict();
export type ReorderEventAssetsInput = z.infer<typeof reorderEventAssetsInputSchema>;

export const eventLeadSchema = z.enum(['1d', '1h']);
export type EventLead = z.infer<typeof eventLeadSchema>;

export const eventAttendeeSourceSchema = z.enum(['self', 'manual', 'automation', 'bundle']);
export type EventAttendeeSource = z.infer<typeof eventAttendeeSourceSchema>;

export const eventAttendeeSchema = z
  .object({
    orgUserId: idSchema,
    name: z.string(),
    avatarUrl: z.string().nullable(),
    source: eventAttendeeSourceSchema.describe(
      '`self`: registered themselves. `manual`: added by staff or an API client. `bundle`: attends only through a bundle',
    ),
    grantedAt: z.coerce.date(),
  })
  .strict();
export type EventAttendee = z.output<typeof eventAttendeeSchema>;

export const eventAttendeeFaceSchema = eventAttendeeSchema.pick({
  orgUserId: true,
  name: true,
  avatarUrl: true,
});
export type EventAttendeeFace = z.output<typeof eventAttendeeFaceSchema>;

export const memberEventViewerSchema = z
  .object({
    attending: z.boolean().describe('The caller attends, directly or through a bundle'),
    canRegister: z.boolean().describe('The caller may register now'),
    canOpen: z.boolean().describe('The caller gets the location, files and recording'),
    canLeave: z
      .boolean()
      .describe('The caller holds a direct grant they may give up; false through a bundle only'),
    canManageAttendees: z.boolean().describe('The caller may add and remove attendees'),
    canAddAttendees: z
      .boolean()
      .describe('The caller may add attendees now: they manage attendees and the event is open'),
    canEdit: z.boolean(),
    canCancel: z.boolean(),
    canDelete: z.boolean(),
  })
  .strict();
export type MemberEventViewer = z.output<typeof memberEventViewerSchema>;

export const memberEventSchema = eventViewSchema
  .omit({ createdAt: true, updatedAt: true, location: true, settings: true })
  .extend({
    location: eventLocationSchema
      .nullable()
      .describe('Null when the caller sees the event only because it is published and public'),
    settings: eventSettingsSchema.omit({ notifications: true }),
    files: z.array(eventFileSchema).describe('Empty when the caller cannot open the event'),
    attendeeCount: z.number().int().min(0),
    attendees: z.array(eventAttendeeFaceSchema).describe('Up to 10 attendees, for the avatars'),
    placesLeft: z
      .number()
      .int()
      .min(0)
      .nullable()
      .describe('Capacity less the attendees; null with no capacity'),
    viewer: memberEventViewerSchema,
  })
  .strict();
export type MemberEvent = z.output<typeof memberEventSchema>;

export const memberEventSummarySchema = memberEventSchema
  .omit({ description: true, files: true })
  .describe('An event as listed: the event read without its description and files');
export type MemberEventSummary = z.output<typeof memberEventSummarySchema>;

export const memberEventsQuerySchema = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    when: z.enum(['upcoming', 'past']).optional(),
    attending: z.boolean().optional(),
  })
  .strict();
export type MemberEventsQuery = z.infer<typeof memberEventsQuerySchema>;

export const eventAnalyticsSchema = z
  .object({
    attendees: z.number().int().min(0).describe('Attending now, directly or through a bundle'),
    capacity: z.number().int().nullable(),
    bySource: z
      .object({
        self: z.number().int().min(0),
        manual: z.number().int().min(0),
        automation: z.number().int().min(0),
        bundle: z.number().int().min(0),
      })
      .strict()
      .describe('Attendees per source'),
    revoked: z.number().int().min(0).describe('Direct grants that are now revoked'),
    grantsOverTime: z
      .array(z.object({ date: z.string(), count: z.number().int().min(0) }).strict())
      .describe('Current direct grants by grant date (UTC), before the start'),
  })
  .strict();
export type EventAnalytics = z.output<typeof eventAnalyticsSchema>;
