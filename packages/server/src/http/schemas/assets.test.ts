import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { Asset, AssetsPage, RequestMemberUpload, UploadTicket } from './assets.js';

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
  url: 'https://storage/get',
  downloadUrl: 'https://storage/get?download',
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
    const page = z.encode(AssetsPage, { rows: [asset], total: 1, page: 1, pageSize: 20 } as never);
    expect(page.rows[0]).not.toHaveProperty('key');
  });

  it('carry the signed url beside the asset', () => {
    expect(z.encode(Asset, asset as never)).toMatchObject({ url: 'https://storage/get' });
    expect(z.encode(Asset, { ...asset, url: null, downloadUrl: null } as never)).toMatchObject({
      url: null,
      downloadUrl: null,
    });
  });

  it('accept only raster image types for a member upload', () => {
    const accepts = (contentType: string) =>
      RequestMemberUpload.safeParse({ filename: 'me', contentType }).success;
    for (const type of ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']) {
      expect(accepts(type)).toBe(true);
    }
    for (const type of ['image/svg+xml', 'image/tiff', 'application/pdf', 'image/png; x=1']) {
      expect(accepts(type)).toBe(false);
    }
  });
});
