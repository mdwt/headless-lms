import { describe, expect, it } from 'vitest';
import { OWNER, runCase, toolSpecs, type ToolCase } from '../test-support.js';
import { catalogTools } from './catalog.js';

const files = [{ assetId: 'ast_1', displayName: 'Workbook' }];

const cases: ToolCase[] = [
  {
    tool: 'list_downloads',
    args: {},
    service: 'content.listDownloads',
    expected: [{ page: 1, pageSize: 20 }, OWNER],
  },
  {
    tool: 'list_download_files',
    args: { downloadId: 'dl_1' },
    service: 'content.listDownloadAssets',
    expected: ['dl_1', OWNER],
    returns: files,
  },
  {
    tool: 'create_download',
    args: { title: 'Kit' },
    service: 'content.createDownload',
    expected: [{ title: 'Kit', description: '', category: '' }, OWNER],
  },
  {
    tool: 'update_download',
    args: { downloadId: 'dl_1', status: 'published' },
    service: 'content.updateDownload',
    expected: ['dl_1', { status: 'published' }, OWNER],
  },
  {
    tool: 'add_download_file',
    args: { downloadId: 'dl_1', assetId: 'ast_1' },
    service: 'content.addDownloadAsset',
    expected: ['dl_1', { assetId: 'ast_1' }, OWNER],
    returns: files,
  },
  {
    tool: 'rename_download_file',
    args: { downloadId: 'dl_1', assetId: 'ast_1', displayName: 'Workbook' },
    service: 'content.renameDownloadAsset',
    expected: ['dl_1', 'ast_1', 'Workbook', OWNER],
    returns: files,
  },
  {
    tool: 'reorder_download_files',
    args: { downloadId: 'dl_1', assetIds: ['ast_2', 'ast_1'] },
    service: 'content.reorderDownloadAssets',
    expected: ['dl_1', ['ast_2', 'ast_1'], OWNER],
    returns: files,
  },
  {
    tool: 'remove_download_file',
    args: { downloadId: 'dl_1', assetId: 'ast_1' },
    service: 'content.removeDownloadAsset',
    expected: ['dl_1', 'ast_1', OWNER],
    returns: [],
  },
  {
    tool: 'delete_download',
    args: { downloadId: 'dl_1' },
    service: 'content.removeDownload',
    expected: ['dl_1', OWNER],
    returns: undefined,
  },
  {
    tool: 'list_bundles',
    args: { search: 'starter' },
    service: 'content.listBundles',
    expected: [{ page: 1, pageSize: 20, search: 'starter' }, OWNER],
  },
  {
    tool: 'list_bundle_items',
    args: { bundleId: 'bdl_1' },
    service: 'content.listBundleItems',
    expected: ['bdl_1', OWNER],
    returns: [{ contentId: 'crs_1' }],
  },
  {
    tool: 'create_bundle',
    args: { name: 'Starter', contentIds: ['crs_1'] },
    service: 'content.createBundle',
    expected: [{ name: 'Starter', contentIds: ['crs_1'] }, OWNER],
  },
  {
    tool: 'rename_bundle',
    args: { bundleId: 'bdl_1', name: 'Starter pack' },
    service: 'content.updateBundle',
    expected: ['bdl_1', { name: 'Starter pack' }, OWNER],
  },
  {
    tool: 'add_bundle_item',
    args: { bundleId: 'bdl_1', contentId: 'crs_2' },
    service: 'content.addBundleItem',
    expected: ['bdl_1', 'crs_2', OWNER],
    returns: [{ contentId: 'crs_2' }],
  },
  {
    tool: 'remove_bundle_item',
    args: { bundleId: 'bdl_1', contentId: 'crs_2' },
    service: 'content.removeBundleItem',
    expected: ['bdl_1', 'crs_2', OWNER],
    returns: [],
  },
  {
    tool: 'delete_bundle',
    args: { bundleId: 'bdl_1' },
    service: 'content.deleteBundle',
    expected: ['bdl_1', OWNER],
    returns: undefined,
  },
  {
    tool: 'list_media',
    args: { kind: 'video' },
    service: 'assets.list',
    expected: [{ page: 1, pageSize: 20, kind: 'video' }, OWNER],
    returns: {
      rows: [
        {
          orgId: 'org_1',
          id: 'ast_1',
          key: 'org_1/ast_1/intro.mp4',
          kind: 'video',
          source: 'library',
          filename: 'intro.mp4',
          contentType: 'video/mp4',
          size: 1024,
          status: 'ready',
          uploadedBy: 'ou_1',
          contentId: null,
          createdAt: new Date('2026-10-30T00:00:00.000Z'),
          updatedAt: new Date('2026-10-30T00:00:00.000Z'),
          url: 'https://lms.example.com/api/assets/ast_1/file',
          downloadUrl: 'https://lms.example.com/api/assets/ast_1/download',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    },
    shown: {
      rows: [
        {
          orgId: 'org_1',
          id: 'ast_1',
          kind: 'video',
          source: 'library',
          filename: 'intro.mp4',
          contentType: 'video/mp4',
          size: 1024,
          status: 'ready',
          uploadedBy: 'ou_1',
          contentId: null,
          createdAt: '2026-10-30T00:00:00.000Z',
          updatedAt: '2026-10-30T00:00:00.000Z',
          url: 'https://lms.example.com/api/assets/ast_1/file',
          downloadUrl: 'https://lms.example.com/api/assets/ast_1/download',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    },
  },
];

describe('download, bundle and media tools', () => {
  it('declare their operation and hints', () => {
    expect(toolSpecs(catalogTools)).toEqual([
      ['list_downloads', 'read', true, false],
      ['list_download_files', 'read', true, false],
      ['create_download', 'write', false, false],
      ['update_download', 'write', true, false],
      ['add_download_file', 'write', false, false],
      ['rename_download_file', 'write', true, false],
      ['reorder_download_files', 'write', true, false],
      ['remove_download_file', 'destructive', true, false],
      ['delete_download', 'destructive', true, false],
      ['list_bundles', 'read', true, false],
      ['list_bundle_items', 'read', true, false],
      ['create_bundle', 'write', false, false],
      ['rename_bundle', 'write', true, false],
      ['add_bundle_item', 'write', false, false],
      ['remove_bundle_item', 'destructive', true, false],
      ['delete_bundle', 'destructive', true, false],
      ['list_media', 'read', true, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(catalogTools, c));
});
