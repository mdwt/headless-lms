import {
  AddBundleItem,
  AddDownloadAsset,
  AssetsPage,
  AssetsQuery,
  BundleIdParam,
  BundleItemParams,
  BundlesQuery,
  CreateBundle,
  CreateDownload,
  DownloadAssetParams,
  DownloadIdParam,
  DownloadsQuery,
  RenameDownloadAsset,
  ReorderDownloadAssets,
  UpdateBundle,
  UpdateDownload,
} from '../../schemas/index.js';
import { defineTool, type Tool } from '../tool.js';

export const catalogTools: Tool[] = [
  defineTool({
    name: 'list_downloads',
    title: 'List downloads',
    description:
      'Search and page through downloads: file collections a student can be granted. Filter by status or category.',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: DownloadsQuery,
    call: (input, { container, caller }) => container.content.listDownloads(input, caller.actor),
  }),
  defineTool({
    name: 'list_download_files',
    title: 'List download files',
    description: 'The files of a download, in order, with their display names.',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: DownloadIdParam,
    call: ({ downloadId }, { container, caller }) =>
      container.content.listDownloadAssets(downloadId, caller.actor),
  }),
  defineTool({
    name: 'create_download',
    title: 'Create download',
    description:
      'Create a draft download. Add files with add_download_file and publish it with update_download.',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: CreateDownload,
    call: (input, { container, caller }) => container.content.createDownload(input, caller.actor),
  }),
  defineTool({
    name: 'update_download',
    title: 'Update download',
    description:
      'Change a download title, description, category or cover image, or publish and unpublish it with status. Fields left out stay as they are.',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateDownload.extend(DownloadIdParam.shape),
    call: ({ downloadId, ...patch }, { container, caller }) =>
      container.content.updateDownload(downloadId, patch, caller.actor),
  }),
  defineTool({
    name: 'add_download_file',
    title: 'Add file to download',
    description: 'Add an uploaded file to the end of a download. Find file ids with list_media.',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: AddDownloadAsset.extend(DownloadIdParam.shape),
    call: ({ downloadId, ...file }, { container, caller }) =>
      container.content.addDownloadAsset(downloadId, file, caller.actor),
  }),
  defineTool({
    name: 'rename_download_file',
    title: 'Rename download file',
    description: 'Set the name a file shows under in a download. null shows the file name.',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: RenameDownloadAsset.extend(DownloadAssetParams.shape),
    call: ({ downloadId, assetId, displayName }, { container, caller }) =>
      container.content.renameDownloadAsset(downloadId, assetId, displayName, caller.actor),
  }),
  defineTool({
    name: 'reorder_download_files',
    title: 'Reorder download files',
    description:
      'Set the file order of a download. Pass every file id of the download in the new order.',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: ReorderDownloadAssets.extend(DownloadIdParam.shape),
    call: ({ downloadId, assetIds }, { container, caller }) =>
      container.content.reorderDownloadAssets(downloadId, assetIds, caller.actor),
  }),
  defineTool({
    name: 'remove_download_file',
    title: 'Remove file from download',
    description: 'Take a file out of a download. The uploaded file itself is kept.',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: DownloadAssetParams,
    call: ({ downloadId, assetId }, { container, caller }) =>
      container.content.removeDownloadAsset(downloadId, assetId, caller.actor),
  }),
  defineTool({
    name: 'delete_download',
    title: 'Delete download',
    description: 'Permanently delete a download. The uploaded files are kept.',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: DownloadIdParam,
    call: ({ downloadId }, { container, caller }) =>
      container.content.removeDownload(downloadId, caller.actor),
  }),
  defineTool({
    name: 'list_bundles',
    title: 'List bundles',
    description:
      'Search and page through bundles: sets of courses, downloads, communities and events granted together.',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: BundlesQuery,
    call: (input, { container, caller }) => container.content.listBundles(input, caller.actor),
  }),
  defineTool({
    name: 'list_bundle_items',
    title: 'List bundle items',
    description: 'The courses, downloads, communities and events in a bundle.',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: BundleIdParam,
    call: ({ bundleId }, { container, caller }) =>
      container.content.listBundleItems(bundleId, caller.actor),
  }),
  defineTool({
    name: 'create_bundle',
    title: 'Create bundle',
    description:
      'Create a bundle, optionally with the course, download, community and event ids it starts with.',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: CreateBundle,
    call: (input, { container, caller }) => container.content.createBundle(input, caller.actor),
  }),
  defineTool({
    name: 'rename_bundle',
    title: 'Rename bundle',
    description: 'Rename a bundle.',
    kind: 'write',
    idempotent: true,
    openWorld: false,
    input: UpdateBundle.extend(BundleIdParam.shape),
    call: ({ bundleId, ...patch }, { container, caller }) =>
      container.content.updateBundle(bundleId, patch, caller.actor),
  }),
  defineTool({
    name: 'add_bundle_item',
    title: 'Add to bundle',
    description:
      'Add a course, download, community or event to a bundle. Returns the bundle items.',
    kind: 'write',
    idempotent: false,
    openWorld: false,
    input: AddBundleItem.extend(BundleIdParam.shape),
    call: ({ bundleId, contentId }, { container, caller }) =>
      container.content.addBundleItem(bundleId, contentId, caller.actor),
  }),
  defineTool({
    name: 'remove_bundle_item',
    title: 'Remove from bundle',
    description:
      'Take a course, download, community or event out of a bundle. Returns the remaining items.',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: BundleItemParams,
    call: ({ bundleId, contentId }, { container, caller }) =>
      container.content.removeBundleItem(bundleId, contentId, caller.actor),
  }),
  defineTool({
    name: 'delete_bundle',
    title: 'Delete bundle',
    description:
      'Permanently delete a bundle. Its courses, downloads, communities and events are kept.',
    kind: 'destructive',
    idempotent: true,
    openWorld: false,
    input: BundleIdParam,
    call: ({ bundleId }, { container, caller }) =>
      container.content.deleteBundle(bundleId, caller.actor),
  }),
  defineTool({
    name: 'list_media',
    title: 'List media',
    description:
      'Search and page through uploaded files, to use in downloads and events or as cover images of courses, downloads, communities and events. Uploading is done in the admin app.',
    kind: 'read',
    idempotent: true,
    openWorld: false,
    input: AssetsQuery,
    output: AssetsPage,
    call: (input, { container, caller }) => container.assets.list(input, caller.actor),
  }),
];
