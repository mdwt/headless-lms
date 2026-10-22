import { describe, it, expect, vi } from 'vitest';
import { AssetsServiceImpl, kindOf } from './service.js';
import type { AssetsRepository, AssetsUnitOfWork } from './ports.js';
import type { Asset } from './model.js';
import type { NewDomainEvent, ObjectStorage, OutboxAppender } from '../shared/ports.js';
import { createCapturingLogger } from '../shared/logger.js';

function fakeStorage(stat: { size: number; contentType: string } = { size: 42, contentType: 'video/mp4' }) {
  const storage: ObjectStorage = {
    presignUpload: vi.fn(async ({ key }) => ({
      url: `https://storage/${key}`,
      method: 'PUT' as const,
      key,
      expiresInSeconds: 300,
      headers: {},
    })),
    presignDownload: vi.fn(async () => 'https://storage/download'),
    stat: vi.fn(async (key: string) => ({ key, ...stat })),
    remove: vi.fn(async () => {}),
  };
  return storage;
}

function fakeRepo(referenced: Set<string> = new Set()) {
  const assets: Asset[] = [];
  const repo: AssetsRepository = {
    async insert(_orgId, asset) {
      assets.push(asset);
      return asset;
    },
    async list(_orgId, query) {
      const rows = assets.filter((a) => !query.source || a.source === query.source);
      return { rows, total: rows.length, page: 1, pageSize: 20 };
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
    async isReferenced(_orgId, id) {
      return referenced.has(id);
    },
    async listUnreferencedMemberUploads(_orgId, before) {
      return assets.filter(
        (a) => a.source === 'member' && !referenced.has(a.id) && a.createdAt < before,
      );
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

function service(overrides: Partial<ConstructorParameters<typeof AssetsServiceImpl>[0]> = {}) {
  const { repo, assets } = fakeRepo();
  const { uow, appended } = fakeUow(repo);
  const storage = overrides.storage ?? fakeStorage();
  const svc = new AssetsServiceImpl({
    repo,
    uow,
    memberImageMaxBytes: 1000,
    ...overrides,
    storage,
  });
  return { svc, repo, assets, appended, storage };
}

describe('kindOf', () => {
  it('derives the media class from the content type', () => {
    expect(kindOf('image/png')).toBe('image');
    expect(kindOf('IMAGE/JPEG')).toBe('image');
    expect(kindOf('video/mp4')).toBe('video');
    expect(kindOf('audio/mpeg')).toBe('audio');
    expect(kindOf('application/pdf')).toBe('document');
    expect(kindOf('')).toBe('document');
  });
});

describe('AssetsService', () => {
  it('logs upload request, confirm, and removal and strips the key from public data', async () => {
    const { logger, entries } = createCapturingLogger();
    const { svc, appended } = service({ logger });

    const ticket = await svc.requestUpload('org-1', {
      filename: 'a.mp4',
      contentType: 'video/mp4',
      source: 'library',
      uploadedBy: 'ou_1',
    });
    expect(ticket.asset.kind).toBe('video');
    expect(ticket.asset.source).toBe('library');
    await svc.confirm('org-1', ticket.asset.id);
    await svc.remove('org-1', ticket.asset.id);

    expect(entries.filter((e) => e.level === 'info').map((e) => e.msg)).toEqual([
      'asset upload requested',
      'asset confirmed',
      'asset removed',
    ]);
    expect(appended.map((e) => e.type)).toEqual(['asset.created', 'asset.ready', 'asset.deleted']);
    expect(appended[0]?.data).toMatchObject({ id: ticket.asset.id, status: 'pending' });
  });

  it('lists the library by default and member uploads on request', async () => {
    const { svc } = service();
    await svc.requestUpload('org-1', {
      filename: 'a.mp4',
      contentType: 'video/mp4',
      source: 'library',
      uploadedBy: 'ou_1',
    });
    await svc.requestMemberUpload('org-1', 'ou_2', { filename: 'me.png', contentType: 'image/png' });

    const library = await svc.list('org-1', { page: 1, pageSize: 20 });
    expect(library.rows.map((a) => a.source)).toEqual(['library']);
    const member = await svc.list('org-1', { page: 1, pageSize: 20, source: 'member' });
    expect(member.rows.map((a) => a.source)).toEqual(['member']);
  });

  it('refuses a member upload that is not an image', async () => {
    const { svc } = service();
    await expect(
      svc.requestMemberUpload('org-1', 'ou_1', { filename: 'a.pdf', contentType: 'application/pdf' }),
    ).rejects.toThrow('A member upload must be an image');
  });

  it('owns only a ready member image uploaded by that org user', async () => {
    const { svc } = service({ storage: fakeStorage({ size: 10, contentType: 'image/png' }) });
    const video = await svc.requestUpload('org-1', {
      filename: 'a.mp4',
      contentType: 'video/mp4',
      source: 'library',
      uploadedBy: 'ou_1',
    });
    const image = await svc.requestMemberUpload('org-1', 'ou_1', {
      filename: 'me.png',
      contentType: 'image/png',
    });

    expect(image.asset.kind).toBe('image');
    expect(image.asset.source).toBe('member');
    expect(image.asset.uploadedBy).toBe('ou_1');
    expect(await svc.ownsImage('org-1', image.asset.id, 'ou_1')).toBe(false);
    expect(await svc.confirmOwn('org-1', image.asset.id, 'ou_2')).toBeNull();
    expect(await svc.confirmOwn('org-1', video.asset.id, 'ou_1')).toBeNull();
    const confirmed = await svc.confirmOwn('org-1', image.asset.id, 'ou_1');
    expect(confirmed?.status).toBe('ready');
    expect(await svc.ownsImage('org-1', image.asset.id, 'ou_1')).toBe(true);
    expect(await svc.ownsImage('org-1', image.asset.id, 'ou_2')).toBe(false);
    expect(await svc.ownsImage('org-1', video.asset.id, 'ou_1')).toBe(false);
  });

  it('discards a member upload whose stored bytes are too large or not an image', async () => {
    const big = service({ storage: fakeStorage({ size: 5000, contentType: 'image/png' }) });
    const ticket = await big.svc.requestMemberUpload('org-1', 'ou_1', {
      filename: 'me.png',
      contentType: 'image/png',
    });
    await expect(big.svc.confirm('org-1', ticket.asset.id)).rejects.toThrow('This image is too large');
    expect(big.storage.remove).toHaveBeenCalledWith(ticket.asset.key);
    expect(await big.svc.get('org-1', ticket.asset.id)).toBeNull();
    expect(big.appended.map((e) => e.type)).toEqual(['asset.created', 'asset.deleted']);

    const fake = service({ storage: fakeStorage({ size: 10, contentType: 'application/zip' }) });
    const spoofed = await fake.svc.requestMemberUpload('org-1', 'ou_1', {
      filename: 'me.png',
      contentType: 'image/png',
    });
    await expect(fake.svc.confirm('org-1', spoofed.asset.id)).rejects.toThrow(
      'A member upload must be an image',
    );
    expect(await fake.svc.get('org-1', spoofed.asset.id)).toBeNull();
  });

  it('refuses to remove a referenced asset before touching storage', async () => {
    const { repo, assets } = fakeRepo(new Set(['asset_used']));
    const { uow } = fakeUow(repo);
    const storage = fakeStorage();
    const svc = new AssetsServiceImpl({ storage, repo, uow, memberImageMaxBytes: 1000 });
    const now = new Date();
    assets.push({
      orgId: 'org-1',
      id: 'asset_used',
      key: 'org/org-1/image/asset_used/me.png',
      kind: 'image',
      source: 'member',
      filename: 'me.png',
      contentType: 'image/png',
      size: 10,
      status: 'ready',
      uploadedBy: 'ou_1',
      createdAt: now,
      updatedAt: now,
    });

    await expect(svc.remove('org-1', 'asset_used')).rejects.toThrow('This file is still in use');
    await expect(svc.removeOwn('org-1', 'asset_used', 'ou_1')).rejects.toThrow(
      'This file is still in use',
    );
    expect(storage.remove).not.toHaveBeenCalled();
    expect(await svc.removeOwn('org-1', 'asset_used', 'ou_2')).toBe(false);
  });

  it('lets the uploader remove their own unreferenced upload', async () => {
    const { svc, storage } = service();
    const ticket = await svc.requestMemberUpload('org-1', 'ou_1', {
      filename: 'me.png',
      contentType: 'image/png',
    });
    expect(await svc.removeOwn('org-1', ticket.asset.id, 'ou_2')).toBe(false);
    expect(await svc.removeOwn('org-1', ticket.asset.id, 'ou_1')).toBe(true);
    expect(storage.remove).toHaveBeenCalledWith(ticket.asset.key);
    expect(await svc.get('org-1', ticket.asset.id)).toBeNull();
  });

  it('sweeps member uploads older than the cutoff that nothing references', async () => {
    const { repo, assets } = fakeRepo(new Set(['asset_kept']));
    const { uow, appended } = fakeUow(repo);
    const storage = fakeStorage();
    const svc = new AssetsServiceImpl({ storage, repo, uow, memberImageMaxBytes: 1000 });
    const old = new Date('2026-10-01T00:00:00Z');
    const base = {
      orgId: 'org-1',
      kind: 'image' as const,
      filename: 'me.png',
      contentType: 'image/png',
      size: 10,
      status: 'ready' as const,
      uploadedBy: 'ou_1',
      createdAt: old,
      updatedAt: old,
    };
    assets.push(
      { ...base, id: 'asset_stale', key: 'k1', source: 'member' },
      { ...base, id: 'asset_kept', key: 'k2', source: 'member' },
      { ...base, id: 'asset_lib', key: 'k3', source: 'library' },
      { ...base, id: 'asset_new', key: 'k4', source: 'member', createdAt: new Date() },
    );

    expect(await svc.removeUnattached('org-1', new Date('2026-10-22T00:00:00Z'))).toBe(1);
    expect(assets.map((a) => a.id)).toEqual(['asset_kept', 'asset_lib', 'asset_new']);
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(appended.map((e) => e.type)).toEqual(['asset.deleted']);
  });
});
