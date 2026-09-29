import { z } from 'zod';
import {
  activitySchema,
  bundleItemSchema,
  bundleSchema,
  courseSchema,
  downloadAssetSchema,
  downloadSchema,
  idSchema,
  moduleSchema,
} from '../types/schemas/index.js';
import { defineEvent, type EventOf, type EventOfValues } from '../shared/ports.js';

const downloadAssetsEventSchema = z
  .object({
    downloadId: idSchema,
    assets: z.array(downloadAssetSchema),
  })
  .strict();

const bundleItemsEventSchema = z
  .object({
    bundleId: idSchema,
    items: z.array(bundleItemSchema),
  })
  .strict();

const publicCourse = courseSchema
  .pick({
    orgId: true,
    id: true,
    type: true,
    title: true,
    slug: true,
    description: true,
    status: true,
    category: true,
    thumbnailAssetId: true,
    settings: true,
    createdAt: true,
    updatedAt: true,
  })
  .strip();

const publicModule = moduleSchema
  .pick({
    orgId: true,
    id: true,
    courseId: true,
    title: true,
    seq: true,
    createdAt: true,
    updatedAt: true,
  })
  .strip();

const publicActivity = activitySchema
  .pick({
    orgId: true,
    id: true,
    moduleId: true,
    courseId: true,
    seq: true,
    createdAt: true,
    updatedAt: true,
  })
  .strip();

const publicDownload = downloadSchema
  .pick({
    orgId: true,
    id: true,
    type: true,
    title: true,
    slug: true,
    description: true,
    status: true,
    category: true,
    thumbnailAssetId: true,
    createdAt: true,
    updatedAt: true,
  })
  .strip();

const publicDownloadAsset = downloadAssetSchema
  .pick({
    orgId: true,
    id: true,
    downloadId: true,
    assetId: true,
    seq: true,
    displayName: true,
    createdAt: true,
    updatedAt: true,
  })
  .strip();

const publicDownloadAssets = z.object({
  downloadId: idSchema,
  assets: z.array(publicDownloadAsset),
});

export const contentEvents = {
  courseCreated: defineEvent({
    type: 'content.course.created',
    version: 1,
    data: courseSchema,
    publicData: publicCourse,
  }),
  courseUpdated: defineEvent({
    type: 'content.course.updated',
    version: 1,
    data: courseSchema,
    publicData: publicCourse,
  }),
  courseDeleted: defineEvent({
    type: 'content.course.deleted',
    version: 1,
    data: courseSchema,
    publicData: publicCourse,
  }),
  moduleCreated: defineEvent({
    type: 'content.course.module.created',
    version: 1,
    data: moduleSchema,
    publicData: publicModule,
  }),
  moduleUpdated: defineEvent({
    type: 'content.course.module.updated',
    version: 1,
    data: moduleSchema,
    publicData: publicModule,
  }),
  moduleDeleted: defineEvent({
    type: 'content.course.module.deleted',
    version: 1,
    data: moduleSchema,
    publicData: publicModule,
  }),
  modulesReordered: defineEvent({
    type: 'content.course.modules.reordered',
    version: 1,
    data: z.array(moduleSchema),
    publicData: z.array(publicModule),
  }),
  activityCreated: defineEvent({
    type: 'content.course.activity.created',
    version: 1,
    data: activitySchema,
    publicData: publicActivity,
  }),
  activityUpdated: defineEvent({
    type: 'content.course.activity.updated',
    version: 1,
    data: activitySchema,
    publicData: publicActivity,
  }),
  activityDeleted: defineEvent({
    type: 'content.course.activity.deleted',
    version: 1,
    data: activitySchema,
    publicData: publicActivity,
  }),
  activitiesReordered: defineEvent({
    type: 'content.course.activities.reordered',
    version: 1,
    data: moduleSchema,
    publicData: publicModule,
  }),
  downloadCreated: defineEvent({
    type: 'content.download.created',
    version: 1,
    data: downloadSchema,
    publicData: publicDownload,
  }),
  downloadUpdated: defineEvent({
    type: 'content.download.updated',
    version: 1,
    data: downloadSchema,
    publicData: publicDownload,
  }),
  downloadDeleted: defineEvent({
    type: 'content.download.deleted',
    version: 1,
    data: downloadSchema,
    publicData: publicDownload,
  }),
  downloadAssetAdded: defineEvent({
    type: 'content.download.asset.added',
    version: 1,
    data: downloadAssetsEventSchema,
    publicData: publicDownloadAssets,
  }),
  downloadAssetRemoved: defineEvent({
    type: 'content.download.asset.removed',
    version: 1,
    data: downloadAssetsEventSchema,
    publicData: publicDownloadAssets,
  }),
  downloadAssetRenamed: defineEvent({
    type: 'content.download.asset.renamed',
    version: 1,
    data: downloadAssetsEventSchema,
    publicData: publicDownloadAssets,
  }),
  downloadAssetsReordered: defineEvent({
    type: 'content.download.assets.reordered',
    version: 1,
    data: downloadAssetsEventSchema,
    publicData: publicDownloadAssets,
  }),
  bundleCreated: defineEvent({
    type: 'content.bundle.created',
    version: 1,
    data: bundleSchema,
  }),
  bundleUpdated: defineEvent({
    type: 'content.bundle.updated',
    version: 1,
    data: bundleSchema,
  }),
  bundleDeleted: defineEvent({
    type: 'content.bundle.deleted',
    version: 1,
    data: bundleSchema,
  }),
  bundleItemAdded: defineEvent({
    type: 'content.bundle.item.added',
    version: 1,
    data: bundleItemsEventSchema,
  }),
  bundleItemRemoved: defineEvent({
    type: 'content.bundle.item.removed',
    version: 1,
    data: bundleItemsEventSchema,
  }),
};

export type CourseCreated = EventOf<typeof contentEvents.courseCreated>;
export type CourseUpdated = EventOf<typeof contentEvents.courseUpdated>;
export type CourseDeleted = EventOf<typeof contentEvents.courseDeleted>;
export type CourseModuleCreated = EventOf<typeof contentEvents.moduleCreated>;
export type CourseModuleUpdated = EventOf<typeof contentEvents.moduleUpdated>;
export type CourseModuleDeleted = EventOf<typeof contentEvents.moduleDeleted>;
export type CourseModulesReordered = EventOf<typeof contentEvents.modulesReordered>;
export type CourseActivityCreated = EventOf<typeof contentEvents.activityCreated>;
export type CourseActivityUpdated = EventOf<typeof contentEvents.activityUpdated>;
export type CourseActivityDeleted = EventOf<typeof contentEvents.activityDeleted>;
export type CourseActivitiesReordered = EventOf<typeof contentEvents.activitiesReordered>;
export type DownloadCreated = EventOf<typeof contentEvents.downloadCreated>;
export type DownloadUpdated = EventOf<typeof contentEvents.downloadUpdated>;
export type DownloadDeleted = EventOf<typeof contentEvents.downloadDeleted>;
export type DownloadAssetAdded = EventOf<typeof contentEvents.downloadAssetAdded>;
export type DownloadAssetRemoved = EventOf<typeof contentEvents.downloadAssetRemoved>;
export type DownloadAssetRenamed = EventOf<typeof contentEvents.downloadAssetRenamed>;
export type DownloadAssetsReordered = EventOf<typeof contentEvents.downloadAssetsReordered>;
export type BundleCreated = EventOf<typeof contentEvents.bundleCreated>;
export type BundleUpdated = EventOf<typeof contentEvents.bundleUpdated>;
export type BundleDeleted = EventOf<typeof contentEvents.bundleDeleted>;
export type BundleItemAdded = EventOf<typeof contentEvents.bundleItemAdded>;
export type BundleItemRemoved = EventOf<typeof contentEvents.bundleItemRemoved>;
export type ContentEvent = EventOfValues<typeof contentEvents>;
