import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { Asset, AssetsPage, DownloadTicket, UploadTicket } from './assets.js';

const asset = {
  orgId: 'org_1',
  id: 'ast_1',
  key: 'org/org_1/image/ast_1/me.png',
  kind: 'image',
  source: 'member',
  filename: 'me.png',
  contentType: 'image/png',
  size: 10,
  status: 'ready',
  uploadedBy: 'orm_1',
  createdAt: new Date('2026-10-22T00:00:00Z'),
  updatedAt: new Date('2026-10-22T00:00:00Z'),
};

describe('asset wire schemas', () => {
  it('never carry the storage key', () => {
    expect(z.encode(Asset, asset as never)).not.toHaveProperty('key');
    const upload = z.encode(UploadTicket, {
      asset,
      uploadUrl: 'https://storage/put',
      method: 'PUT',
      expiresInSeconds: 300,
      headers: {},
    } as never);
    expect(upload.asset).not.toHaveProperty('key');
    const download = z.encode(DownloadTicket, { url: 'https://storage/get', asset } as never);
    expect(download.asset).not.toHaveProperty('key');
    const page = z.encode(AssetsPage, { rows: [asset], total: 1, page: 1, pageSize: 20 } as never);
    expect(page.rows[0]).not.toHaveProperty('key');
  });
});
