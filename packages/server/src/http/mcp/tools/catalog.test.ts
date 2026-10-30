import { describe, expect, it } from 'vitest';
import { runCase, toolSpecs, type ToolCase } from '../test-support.js';
import { catalogTools } from './catalog.js';

const files = [{ assetId: 'ast_1', displayName: 'Workbook' }];

const cases: ToolCase[] = [
  {
    tool: 'list_downloads',
    args: {},
    service: 'content.listDownloads',
    expected: ['org_1', { page: 1, pageSize: 20 }],
  },
  {
    tool: 'list_download_files',
    args: { downloadId: 'dl_1' },
    service: 'content.listDownloadAssets',
    expected: ['org_1', 'dl_1'],
    returns: files,
  },
  {
    tool: 'create_download',
    args: { title: 'Kit' },
    service: 'content.createDownload',
    expected: ['org_1', { title: 'Kit', description: '', category: '' }],
  },
  {
    tool: 'update_download',
    args: { downloadId: 'dl_1', status: 'published' },
    service: 'content.updateDownload',
    expected: ['org_1', 'dl_1', { status: 'published' }],
  },
  {
    tool: 'add_download_file',
    args: { downloadId: 'dl_1', assetId: 'ast_1' },
    service: 'content.addDownloadAsset',
    expected: ['org_1', 'dl_1', { assetId: 'ast_1' }],
    returns: files,
  },
  {
    tool: 'rename_download_file',
    args: { downloadId: 'dl_1', assetId: 'ast_1', displayName: 'Workbook' },
    service: 'content.renameDownloadAsset',
    expected: ['org_1', 'dl_1', 'ast_1', 'Workbook'],
    returns: files,
  },
  {
    tool: 'reorder_download_files',
    args: { downloadId: 'dl_1', assetIds: ['ast_2', 'ast_1'] },
    service: 'content.reorderDownloadAssets',
    expected: ['org_1', 'dl_1', ['ast_2', 'ast_1']],
    returns: files,
  },
  {
    tool: 'remove_download_file',
    args: { downloadId: 'dl_1', assetId: 'ast_1' },
    service: 'content.removeDownloadAsset',
    expected: ['org_1', 'dl_1', 'ast_1'],
    returns: [],
  },
  {
    tool: 'delete_download',
    args: { downloadId: 'dl_1' },
    service: 'content.removeDownload',
    expected: ['org_1', 'dl_1', { id: 'ou_1', role: 'owner' }],
    returns: undefined,
  },
  {
    tool: 'list_bundles',
    args: { search: 'starter' },
    service: 'content.listBundles',
    expected: ['org_1', { page: 1, pageSize: 20, search: 'starter' }],
  },
  {
    tool: 'list_bundle_items',
    args: { bundleId: 'bdl_1' },
    service: 'content.listBundleItems',
    expected: ['org_1', 'bdl_1'],
    returns: [{ contentId: 'crs_1' }],
  },
  {
    tool: 'create_bundle',
    args: { name: 'Starter', contentIds: ['crs_1'] },
    service: 'content.createBundle',
    expected: ['org_1', { name: 'Starter', contentIds: ['crs_1'] }],
  },
  {
    tool: 'rename_bundle',
    args: { bundleId: 'bdl_1', name: 'Starter pack' },
    service: 'content.updateBundle',
    expected: ['org_1', 'bdl_1', { name: 'Starter pack' }],
  },
  {
    tool: 'add_bundle_item',
    args: { bundleId: 'bdl_1', contentId: 'crs_2' },
    service: 'content.addBundleItem',
    expected: ['org_1', 'bdl_1', 'crs_2'],
    returns: [{ contentId: 'crs_2' }],
  },
  {
    tool: 'remove_bundle_item',
    args: { bundleId: 'bdl_1', contentId: 'crs_2' },
    service: 'content.removeBundleItem',
    expected: ['org_1', 'bdl_1', 'crs_2'],
    returns: [],
  },
  {
    tool: 'delete_bundle',
    args: { bundleId: 'bdl_1' },
    service: 'content.deleteBundle',
    expected: ['org_1', 'bdl_1'],
    returns: undefined,
  },
  {
    tool: 'list_media',
    args: { kind: 'video' },
    service: 'assets.list',
    expected: ['org_1', { page: 1, pageSize: 20, kind: 'video' }],
  },
];

describe('download, bundle and media tools', () => {
  it('declare their scope and hints', () => {
    expect(toolSpecs(catalogTools)).toEqual([
      ['list_downloads', 'downloads:read', 'read', true, false],
      ['list_download_files', 'downloads:read', 'read', true, false],
      ['create_download', 'downloads:write', 'write', false, false],
      ['update_download', 'downloads:write', 'write', true, false],
      ['add_download_file', 'downloads:write', 'write', false, false],
      ['rename_download_file', 'downloads:write', 'write', true, false],
      ['reorder_download_files', 'downloads:write', 'write', true, false],
      ['remove_download_file', 'downloads:write', 'destructive', true, false],
      ['delete_download', 'downloads:delete', 'destructive', true, false],
      ['list_bundles', 'bundles:read', 'read', true, false],
      ['list_bundle_items', 'bundles:read', 'read', true, false],
      ['create_bundle', 'bundles:write', 'write', false, false],
      ['rename_bundle', 'bundles:write', 'write', true, false],
      ['add_bundle_item', 'bundles:write', 'write', false, false],
      ['remove_bundle_item', 'bundles:write', 'destructive', true, false],
      ['delete_bundle', 'bundles:delete', 'destructive', true, false],
      ['list_media', 'media:read', 'read', true, false],
    ]);
  });

  it.each(cases)('$tool calls $service once', (c) => runCase(catalogTools, c));
});
