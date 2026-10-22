import { describe, it, expect, vi } from 'vitest';
import { AssetsServiceImpl } from './service.js';
import type { AssetsRepository, AssetsUnitOfWork } from './ports.js';
import type { Asset } from './model.js';
import type { NewDomainEvent, ObjectStorage, OutboxAppender } from '../shared/ports.js';
import { createCapturingLogger } from '../shared/logger.js';

function fakeStorage(): ObjectStorage {
  return {
    presignUpload: vi.fn(async ({ key }) => ({
      url: `https://storage/${key}`,
      method: 'PUT' as const,
      key,
      expiresInSeconds: 300,
      headers: {},
    })),
    presignDownload: vi.fn(async () => 'https://storage/download'),
    stat: vi.fn(async (key: string) => ({ key, size: 42, contentType: 'video/mp4' })),
    remove: vi.fn(async () => {}),
  };
}

function fakeRepo() {
  const assets: Asset[] = [];
  const repo: AssetsRepository = {
    async insert(_orgId, asset) {
      assets.push(asset);
      return asset;
    },
    async list() {
      return { rows: assets, total: assets.length, page: 1, pageSize: 20 };
    },
    async findById(_orgId, id) {
      return assets.find((a) => a.id === id) ?? null;
    },
    async update(id, patch) {
      const asset = assets.find((a) => a.id === id);
      if (!asset) {
        return null;
      }
      Object.assign(asset, patch);
      return asset;
    },
    async delete(id) {
      const i = assets.findIndex((a) => a.id === id);
      if (i < 0) {
        return false;
      }
      assets.splice(i, 1);
      return true;
    },
  };
  return { repo, assets };
}

function fakeUow(repo: AssetsRepository) {
  const appended: NewDomainEvent[] = [];
  const append = vi.fn(async (events: NewDomainEvent[]) => {
    appended.push(...events);
  });
  const outbox: OutboxAppender = { append };
  const uow: AssetsUnitOfWork = {
    run: (fn) => fn({ assets: repo, outbox }),
  };
  return { uow, appended };
}

describe('AssetsService logging', () => {
  it('logs upload request, confirm, and removal', async () => {
    const { logger, entries } = createCapturingLogger();
    const { repo } = fakeRepo();
    const { uow, appended } = fakeUow(repo);
    const svc = new AssetsServiceImpl({
      storage: fakeStorage(),
      repo,
      uow,
      logger,
    });

    const ticket = await svc.requestUpload('org-1', {
      kind: 'video',
      filename: 'a.mp4',
      contentType: 'video/mp4',
      uploadedBy: 'u1',
    });
    await svc.confirm('org-1', ticket.asset.id);
    await svc.remove('org-1', ticket.asset.id);

    expect(entries.filter((e) => e.level === 'info').map((e) => e.msg)).toEqual([
      'asset upload requested',
      'asset confirmed',
      'asset removed',
    ]);
    expect(entries[0]?.meta).toMatchObject({
      orgId: 'org-1',
      assetId: ticket.asset.id,
      kind: 'video',
    });
    expect(appended).toEqual([
      {
        type: 'asset.created',
        version: 1,
        orgId: 'org-1',
        data: expect.objectContaining({ id: ticket.asset.id, status: 'pending' }),
      },
      {
        type: 'asset.ready',
        version: 1,
        orgId: 'org-1',
        data: expect.objectContaining({ id: ticket.asset.id, status: 'ready', size: 42 }),
      },
      {
        type: 'asset.deleted',
        version: 1,
        orgId: 'org-1',
        data: expect.objectContaining({ id: ticket.asset.id, status: 'ready', size: 42 }),
      },
    ]);
  });

  it('accepts an image the org user uploaded and refuses every other asset', async () => {
    const { repo } = fakeRepo();
    const { uow } = fakeUow(repo);
    const svc = new AssetsServiceImpl({ storage: fakeStorage(), repo, uow });

    const video = await svc.requestUpload('org-1', {
      kind: 'video',
      filename: 'a.mp4',
      contentType: 'video/mp4',
      uploadedBy: 'ou_1',
    });
    const image = await svc.requestImageUpload('org-1', 'ou_1', {
      filename: 'me.png',
      contentType: 'image/png',
    });

    expect(image.asset.kind).toBe('image');
    expect(image.asset.uploadedBy).toBe('ou_1');
    expect(await svc.ownsImage('org-1', image.asset.id, 'ou_1')).toBe(true);
    expect(await svc.ownsImage('org-1', image.asset.id, 'ou_2')).toBe(false);
    expect(await svc.ownsImage('org-1', video.asset.id, 'ou_1')).toBe(false);
    expect(await svc.confirmOwnImage('org-1', image.asset.id, 'ou_2')).toBeNull();
    expect(await svc.confirmOwnImage('org-1', video.asset.id, 'ou_1')).toBeNull();
    const confirmed = await svc.confirmOwnImage('org-1', image.asset.id, 'ou_1');
    expect(confirmed?.status).toBe('ready');
    expect(confirmed?.kind).toBe('image');
  });
});
