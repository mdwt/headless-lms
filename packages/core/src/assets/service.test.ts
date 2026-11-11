import { describe, it, expect, vi } from 'vitest';
import { createFileUrls } from './file-urls.js';
import { AssetsServiceImpl, kindOf } from './service.js';
import type { AssetsRepository, AssetsUnitOfWork } from './ports.js';
import type { Asset } from './model.js';
import type { NewDomainEvent, ObjectStorage, OutboxAppender } from '../shared/ports.js';
import { createCapturingLogger } from '../shared/logger.js';
import {
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
} from '../shared/errors.js';
import { actorWith } from '../organizations/index.js';
import type { ContentType } from '../types/index.js';

const ITEMS: Record<string, ContentType> = { crs_1: 'course', crs_2: 'course', dl_1: 'download' };

function admin(id = 'ou_admin', orgId = 'org-1') {
  return actorWith({ id, orgId, org: ['media:read', 'media:write', 'media:delete'] });
}

function uploader(id: string, orgId = 'org-1') {
  return actorWith({ id, orgId });
}

function fakeStorage(
  stat: { size: number; contentType: string } = { size: 42, contentType: 'video/mp4' },
) {
  const storage: ObjectStorage = {
    uploadExpirySeconds: 300,
    presignUpload: vi.fn(async ({ key }) => ({
      url: `https://storage/${key}`,
      method: 'PUT' as const,
      key,
      expiresInSeconds: 300,
      headers: {},
    })),
    presignDownload: vi.fn(async () => 'https://storage/download'),
    stat: vi.fn(async (key: string) => ({ key, ...stat })),
    list: vi.fn(async () => []),
    copy: vi.fn(async () => {}),
    publish: vi.fn(async () => {}),
    publicUrl: (key: string) => `https://cdn.test/${key}`,
    remove: vi.fn(async () => {}),
  };
  return storage;
}

function fakeRepo(referenced: Set<string> = new Set()) {
  const assets: Asset[] = [];
  const repo: AssetsRepository = {
    async insert(_orgId, asset) {
      assets.push({ ...asset });
      return asset;
    },
    async list(_orgId, query) {
      const rows = assets.filter(
        (a) =>
          (!query.source || a.source === query.source) &&
          (!query.contentId || a.contentId === query.contentId),
      );
      return { rows, total: rows.length, page: 1, pageSize: 20 };
    },
    async findById(_orgId, id) {
      const asset = assets.find((a) => a.id === id);
      return asset ? { ...asset } : null;
    },
    async findByIds(_orgId, ids) {
      return assets.filter((a) => ids.includes(a.id)).map((a) => ({ ...a }));
    },
    async markReady(_orgId, id, patch) {
      const asset = assets.find((a) => a.id === id && a.status === 'pending');
      if (!asset) {
        return null;
      }
      Object.assign(asset, patch, { status: 'ready' });
      return { ...asset };
    },
    async delete(_orgId, id) {
      if (referenced.has(id)) {
        throw new ConflictError('This file is still in use');
      }
      const i = assets.findIndex((a) => a.id === id);
      if (i < 0) {
        return false;
      }
      assets.splice(i, 1);
      return true;
    },
    async listUnreferencedMemberUploads(_orgId, before) {
      return assets.filter(
        (a) => a.source === 'member' && !referenced.has(a.id) && a.createdAt < before,
      );
    },
    async heldKeys(_orgId, keys) {
      return keys.filter((key) => assets.some((a) => a.key === key));
    },
    async contentTypeOf(_orgId, contentId) {
      return ITEMS[contentId] ?? null;
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
    memberFileMaxBytes: 4000,
    linkWindowSeconds: 21600,
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

    const ticket = await svc.requestUpload(
      { filename: 'a.mp4', contentType: 'video/mp4' },
      admin('ou_1'),
    );
    expect(ticket.asset.kind).toBe('video');
    expect(ticket.asset.source).toBe('library');
    await svc.confirm(ticket.asset.id, admin());
    await svc.remove(ticket.asset.id, admin());

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
    await svc.requestUpload({ filename: 'a.mp4', contentType: 'video/mp4' }, admin('ou_1'));
    await svc.requestMemberUpload(
      {
        filename: 'me.png',
        contentType: 'image/png',
      },
      uploader('ou_2'),
    );

    const library = await svc.list({ page: 1, pageSize: 20 }, admin());
    expect(library.rows.map((a) => a.source)).toEqual(['library']);
    const member = await svc.list({ page: 1, pageSize: 20, source: 'member' }, admin());
    expect(member.rows.map((a) => a.source)).toEqual(['member']);
  });

  it('takes a member upload of any type, and files only a raster image as an image', async () => {
    const { svc } = service();
    const kinds: Record<string, string> = {
      'image/png': 'image',
      'image/jpeg': 'image',
      'image/gif': 'image',
      'image/webp': 'image',
      'image/avif': 'image',
      'image/svg+xml': 'document',
      'image/tiff': 'document',
      'application/pdf': 'document',
      'application/zip': 'document',
      'video/mp4': 'video',
      'audio/mpeg': 'audio',
    };
    for (const [contentType, kind] of Object.entries(kinds)) {
      const ticket = await svc.requestMemberUpload(
        { filename: 'a', contentType },
        uploader('ou_1'),
      );
      expect([contentType, ticket.asset.kind]).toEqual([contentType, kind]);
    }
  });

  it('finalizes an SVG member upload as a file, never as an image', async () => {
    const { svc } = service({ storage: fakeStorage({ size: 10, contentType: 'image/svg+xml' }) });
    const ticket = await svc.requestMemberUpload(
      { filename: 'me.svg', contentType: 'image/svg+xml' },
      uploader('ou_1'),
    );
    const confirmed = await svc.confirmOwn(ticket.asset.id, uploader('ou_1'));
    expect(confirmed).toMatchObject({ status: 'ready', kind: 'document' });
    expect(await svc.ownsImage('org-1', ticket.asset.id, 'ou_1')).toBe(false);
    expect(await svc.ownsUpload('org-1', ticket.asset.id, 'ou_1')).toBe(true);
  });

  it('owns only a ready member image uploaded by that org user', async () => {
    const { svc } = service({ storage: fakeStorage({ size: 10, contentType: 'image/png' }) });
    const video = await svc.requestUpload(
      { filename: 'a.mp4', contentType: 'video/mp4' },
      admin('ou_1'),
    );
    const image = await svc.requestMemberUpload(
      {
        filename: 'me.png',
        contentType: 'image/png',
      },
      uploader('ou_1'),
    );

    expect(image.asset.kind).toBe('image');
    expect(image.asset.source).toBe('member');
    expect(image.asset.uploadedBy).toBe('ou_1');
    expect(await svc.ownsImage('org-1', image.asset.id, 'ou_1')).toBe(false);
    await expect(svc.confirmOwn(image.asset.id, uploader('ou_2'))).rejects.toThrow(NotFoundError);
    await expect(svc.confirmOwn(video.asset.id, uploader('ou_1'))).rejects.toThrow(NotFoundError);
    const confirmed = await svc.confirmOwn(image.asset.id, uploader('ou_1'));
    expect(confirmed?.status).toBe('ready');
    expect(await svc.ownsImage('org-1', image.asset.id, 'ou_1')).toBe(true);
    expect(await svc.ownsImage('org-1', image.asset.id, 'ou_2')).toBe(false);
    expect(await svc.ownsImage('org-1', video.asset.id, 'ou_1')).toBe(false);
  });

  it('holds a member file to the file limit and an image to the image limit', async () => {
    const { svc } = service({
      storage: fakeStorage({ size: 3000, contentType: 'application/pdf' }),
    });
    const pdf = await svc.requestMemberUpload(
      { filename: 'notes.pdf', contentType: 'application/pdf' },
      uploader('ou_1'),
    );
    expect(await svc.confirmOwn(pdf.asset.id, uploader('ou_1'))).toMatchObject({ status: 'ready' });

    const big = service({ storage: fakeStorage({ size: 5000, contentType: 'application/pdf' }) });
    const tooBig = await big.svc.requestMemberUpload(
      { filename: 'notes.pdf', contentType: 'application/pdf' },
      uploader('ou_1'),
    );
    await expect(big.svc.confirmOwn(tooBig.asset.id, uploader('ou_1'))).rejects.toThrow(
      new InvalidInputError('This file is over the 3.9 KB limit'),
    );
  });

  it('lists the ready member uploads among ids, and owns any of them for the uploader', async () => {
    const { svc } = service({ storage: fakeStorage({ size: 10, contentType: 'video/mp4' }) });
    const video = await svc.requestMemberUpload(
      { filename: 'clip.mp4', contentType: 'video/mp4' },
      uploader('ou_1'),
    );
    const library = await svc.requestUpload(
      { filename: 'a.mp4', contentType: 'video/mp4' },
      admin('ou_1'),
    );
    expect(await svc.memberUploads('org-1', [video.asset.id])).toEqual([]);
    expect(await svc.ownsUpload('org-1', video.asset.id, 'ou_1')).toBe(false);
    await svc.confirmOwn(video.asset.id, uploader('ou_1'));
    await svc.confirm(library.asset.id, admin('ou_1'));
    expect(
      await svc.memberUploads('org-1', [video.asset.id, library.asset.id, 'asset_missing']),
    ).toEqual([
      {
        id: video.asset.id,
        kind: 'video',
        filename: 'clip.mp4',
        contentType: 'video/mp4',
        size: 10,
      },
    ]);
    expect(await svc.ownsUpload('org-1', video.asset.id, 'ou_1')).toBe(true);
    expect(await svc.ownsUpload('org-1', video.asset.id, 'ou_2')).toBe(false);
    expect(await svc.ownsUpload('org-1', library.asset.id, 'ou_1')).toBe(false);
    expect(await svc.ownsImage('org-1', video.asset.id, 'ou_1')).toBe(false);
  });

  it('discards a member upload whose stored bytes are too large or not an image', async () => {
    const big = service({ storage: fakeStorage({ size: 5000, contentType: 'image/png' }) });
    const ticket = await big.svc.requestMemberUpload(
      {
        filename: 'me.png',
        contentType: 'image/png',
      },
      uploader('ou_1'),
    );
    await expect(big.svc.confirmOwn(ticket.asset.id, uploader('ou_1'))).rejects.toThrow(
      new InvalidInputError('This image is over the 1000 B limit'),
    );
    expect(big.storage.remove).toHaveBeenCalledWith(ticket.asset.key);
    await expect(big.svc.get(ticket.asset.id, admin())).rejects.toThrow(NotFoundError);
    expect(big.appended.map((e) => e.type)).toEqual(['asset.created', 'asset.deleted']);

    const fake = service({ storage: fakeStorage({ size: 10, contentType: 'application/zip' }) });
    const spoofed = await fake.svc.requestMemberUpload(
      {
        filename: 'me.png',
        contentType: 'image/png',
      },
      uploader('ou_1'),
    );
    await expect(fake.svc.confirmOwn(spoofed.asset.id, uploader('ou_1'))).rejects.toThrow(
      'The uploaded file is not the declared type',
    );
    await expect(fake.svc.get(spoofed.asset.id, admin())).rejects.toThrow(NotFoundError);
  });

  it('leaves storage untouched when the references refuse the delete', async () => {
    const { repo, assets } = fakeRepo(new Set(['asset_used']));
    const { uow } = fakeUow(repo);
    const storage = fakeStorage();
    const svc = new AssetsServiceImpl({
      storage,
      repo,
      uow,
      memberImageMaxBytes: 1000,
      memberFileMaxBytes: 4000,
      linkWindowSeconds: 21600,
    });
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
      contentId: null,
      createdAt: now,
      updatedAt: now,
    });

    await expect(svc.remove('asset_used', admin())).rejects.toThrow('This file is still in use');
    await expect(svc.removeOwn('asset_used', uploader('ou_1'))).rejects.toThrow(
      'This file is still in use',
    );
    expect(storage.remove).not.toHaveBeenCalled();
    await expect(svc.removeOwn('asset_used', uploader('ou_2'))).rejects.toThrow(NotFoundError);
  });

  it('lets the uploader remove their own unreferenced upload', async () => {
    const { svc, storage } = service();
    const ticket = await svc.requestMemberUpload(
      {
        filename: 'me.png',
        contentType: 'image/png',
      },
      uploader('ou_1'),
    );
    await expect(svc.removeOwn(ticket.asset.id, uploader('ou_2'))).rejects.toThrow(NotFoundError);
    await expect(svc.removeOwn(ticket.asset.id, uploader('ou_1'))).resolves.toBeUndefined();
    expect(storage.remove).toHaveBeenCalledWith(ticket.asset.key);
    await expect(svc.get(ticket.asset.id, admin())).rejects.toThrow(NotFoundError);
  });

  it('sweeps member uploads older than the one-hour grace that nothing references', async () => {
    const { repo, assets } = fakeRepo(new Set(['asset_kept']));
    const { uow, appended } = fakeUow(repo);
    const storage = fakeStorage();
    const svc = new AssetsServiceImpl({
      storage,
      repo,
      uow,
      memberImageMaxBytes: 1000,
      memberFileMaxBytes: 4000,
      linkWindowSeconds: 21600,
    });
    const now = new Date('2026-10-22T12:00:00Z');
    const old = new Date('2026-10-22T10:00:00Z');
    const base = {
      orgId: 'org-1',
      kind: 'image' as const,
      filename: 'me.png',
      contentType: 'image/png',
      size: 10,
      status: 'ready' as const,
      uploadedBy: 'ou_1',
      contentId: null,
      createdAt: old,
      updatedAt: old,
    };
    assets.push(
      { ...base, id: 'asset_stale', key: 'k1', source: 'member' },
      { ...base, id: 'asset_kept', key: 'k2', source: 'member' },
      { ...base, id: 'asset_lib', key: 'k3', source: 'library' },
      {
        ...base,
        id: 'asset_recent',
        key: 'k4',
        source: 'member',
        createdAt: new Date('2026-10-22T11:30:00Z'),
      },
    );

    expect(await svc.removeUnattached('org-1', now)).toBe(1);
    expect(assets.map((a) => a.id)).toEqual(['asset_kept', 'asset_lib', 'asset_recent']);
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(appended.map((e) => e.type)).toEqual(['asset.deleted']);
    expect(await svc.removeUnattached('org-1', now)).toBe(0);
  });

  it('skips an upload that was attached after the sweep listed it', async () => {
    const { repo, assets } = fakeRepo();
    const { uow } = fakeUow(repo);
    const storage = fakeStorage();
    const svc = new AssetsServiceImpl({
      storage,
      repo,
      uow,
      memberImageMaxBytes: 1000,
      memberFileMaxBytes: 4000,
      linkWindowSeconds: 21600,
    });
    const old = new Date('2026-10-01T00:00:00Z');
    assets.push({
      orgId: 'org-1',
      id: 'asset_raced',
      key: 'k1',
      kind: 'image',
      source: 'member',
      filename: 'me.png',
      contentType: 'image/png',
      size: 10,
      status: 'ready',
      uploadedBy: 'ou_1',
      contentId: null,
      createdAt: old,
      updatedAt: old,
    });
    repo.delete = async () => {
      throw new ConflictError('This file is still in use');
    };

    expect(await svc.removeUnattached('org-1', new Date('2026-10-22T00:00:00Z'))).toBe(0);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('keeps sweeping past an upload that fails to delete and logs it', async () => {
    const { repo, assets } = fakeRepo();
    const { uow } = fakeUow(repo);
    const { logger, entries } = createCapturingLogger();
    const svc = new AssetsServiceImpl({
      storage: fakeStorage(),
      repo,
      uow,
      memberImageMaxBytes: 1000,
      memberFileMaxBytes: 4000,
      linkWindowSeconds: 21600,
      logger,
    });
    const old = new Date('2026-10-01T00:00:00Z');
    const base = {
      orgId: 'org-1',
      kind: 'image' as const,
      source: 'member' as const,
      filename: 'me.png',
      contentType: 'image/png',
      size: 10,
      status: 'ready' as const,
      uploadedBy: 'ou_1',
      contentId: null,
      createdAt: old,
      updatedAt: old,
    };
    assets.push({ ...base, id: 'asset_broken', key: 'k1' }, { ...base, id: 'asset_ok', key: 'k2' });
    const del = repo.delete.bind(repo);
    repo.delete = async (orgId, id) => {
      if (id === 'asset_broken') {
        throw new Error('db down');
      }
      return del(orgId, id);
    };

    expect(await svc.removeUnattached('org-1', new Date('2026-10-22T00:00:00Z'))).toBe(1);
    expect(assets.map((a) => a.id)).toEqual(['asset_broken']);
    expect(entries).toContainEqual({
      level: 'error',
      msg: 'unattached upload not removed',
      meta: { orgId: 'org-1', assetId: 'asset_broken', err: new Error('db down') },
    });
    expect(entries).toContainEqual(
      expect.objectContaining({
        msg: 'unattached uploads removed',
        meta: { orgId: 'org-1', count: 1, stray: 0, publicCopies: 0, failed: 1 },
      }),
    );
  });

  it('deletes the registry row before the stored object', async () => {
    const { svc, repo, storage } = service();
    const order: string[] = [];
    const del = repo.delete.bind(repo);
    repo.delete = async (orgId, id) => {
      order.push('row');
      return del(orgId, id);
    };
    vi.mocked(storage.remove).mockImplementation(async () => {
      order.push('object');
    });
    const ticket = await svc.requestUpload(
      { filename: 'a.mp4', contentType: 'video/mp4' },
      admin('ou_1'),
    );

    await expect(svc.remove(ticket.asset.id, admin())).resolves.toBeUndefined();
    expect(order).toEqual(['row', 'object']);
  });

  it('finalizes a member upload under a key the upload ticket does not cover', async () => {
    const { svc, storage } = service({
      storage: fakeStorage({ size: 10, contentType: 'image/png' }),
    });
    const ticket = await svc.requestMemberUpload(
      {
        filename: 'me.png',
        contentType: 'image/png',
      },
      uploader('ou_1'),
    );

    const confirmed = await svc.confirmOwn(ticket.asset.id, uploader('ou_1'));

    expect(confirmed?.status).toBe('ready');
    expect(ticket.asset.key).toBe(`org/org-1/uploads/${ticket.asset.id}/me.png`);
    expect(confirmed?.key).toBe(`org/org-1/image/${ticket.asset.id}/me.png`);
    expect(storage.copy).toHaveBeenCalledWith({ from: ticket.asset.key, to: confirmed?.key });
    expect(storage.stat).toHaveBeenCalledWith(confirmed?.key);
    expect(storage.remove).toHaveBeenCalledWith(ticket.asset.key);
    expect(confirmed?.url).toBe('https://storage/download');
    expect(storage.presignDownload).toHaveBeenCalledWith(
      expect.objectContaining({ key: confirmed?.key }),
    );
  });

  it('leaves a ready asset and its bytes alone when it is confirmed again', async () => {
    const storage = fakeStorage({ size: 10, contentType: 'image/png' });
    const { svc, appended } = service({ storage });
    const ticket = await svc.requestMemberUpload(
      {
        filename: 'me.png',
        contentType: 'image/png',
      },
      uploader('ou_1'),
    );
    const confirmed = await svc.confirmOwn(ticket.asset.id, uploader('ou_1'));
    vi.mocked(storage.stat).mockResolvedValue({ key: 'k', size: 5000, contentType: 'image/png' });
    vi.mocked(storage.remove).mockClear();

    const again = await svc.confirmOwn(ticket.asset.id, uploader('ou_1'));

    expect(again).toEqual(confirmed);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(await svc.get(ticket.asset.id, admin())).not.toBeNull();
    expect(appended.map((e) => e.type)).toEqual(['asset.created', 'asset.ready']);
  });

  it('re-derives the kind from the stored content type when an upload is confirmed', async () => {
    const { svc } = service({ storage: fakeStorage({ size: 42, contentType: 'video/mp4' }) });
    const ticket = await svc.requestUpload(
      { filename: 'clip', contentType: 'application/octet-stream' },
      admin('ou_1'),
    );
    expect(ticket.asset.kind).toBe('document');

    const confirmed = await svc.confirm(ticket.asset.id, admin());

    expect(confirmed).toMatchObject({ kind: 'video', contentType: 'video/mp4', size: 42 });
  });

  it('refuses staff the finalize and the URL of a member upload but lets them delete it', async () => {
    const { svc } = service({ storage: fakeStorage({ size: 10, contentType: 'image/png' }) });
    const library = await svc.requestUpload(
      { filename: 'a.png', contentType: 'image/png' },
      admin('ou_staff'),
    );
    const member = await svc.requestMemberUpload(
      {
        filename: 'me.png',
        contentType: 'image/png',
      },
      uploader('ou_1'),
    );

    await expect(svc.confirm(member.asset.id, admin())).rejects.toThrow(
      'Only the uploader can finalize a member upload',
    );
    await svc.confirm(library.asset.id, admin());
    await svc.confirmOwn(member.asset.id, uploader('ou_1'));
    expect((await svc.get(member.asset.id, admin()))?.url).toBeNull();
    expect((await svc.get(library.asset.id, admin()))?.url).toBe('https://storage/download');
    await expect(svc.remove(member.asset.id, admin())).resolves.toBeUndefined();
  });

  it('answers which ids are ready library assets of the org, in the order asked', async () => {
    const { svc } = service({ storage: fakeStorage({ size: 10, contentType: 'image/png' }) });
    const upload = (filename: string) =>
      svc.requestUpload({ filename, contentType: 'image/png' }, admin('ou_staff'));
    const first = await upload('a.png');
    const second = await upload('b.png');
    const pending = await upload('c.png');
    const member = await svc.requestMemberUpload(
      {
        filename: 'me.png',
        contentType: 'image/png',
      },
      uploader('ou_1'),
    );
    await svc.confirm(first.asset.id, admin());
    await svc.confirm(second.asset.id, admin());
    await svc.confirmOwn(member.asset.id, uploader('ou_1'));

    expect(
      await svc.libraryAssetsFor('org-1', [
        second.asset.id,
        pending.asset.id,
        member.asset.id,
        'ast_missing',
        first.asset.id,
      ]),
    ).toEqual([
      { id: second.asset.id, contentId: null },
      { id: first.asset.id, contentId: null },
    ]);
  });

  it('checks the copied object, which the upload ticket cannot replace', async () => {
    const storage = fakeStorage();
    vi.mocked(storage.stat).mockImplementation(async (key: string) =>
      key.includes('/uploads/')
        ? { key, size: 10, contentType: 'image/png' }
        : { key, size: 5000, contentType: 'image/png' },
    );
    const { svc } = service({ storage });
    const ticket = await svc.requestMemberUpload(
      {
        filename: 'me.png',
        contentType: 'image/png',
      },
      uploader('ou_1'),
    );

    await expect(svc.confirmOwn(ticket.asset.id, uploader('ou_1'))).rejects.toThrow(
      'This image is over the 1000 B limit',
    );
    const copied = vi.mocked(storage.copy).mock.calls[0]?.[0].to;
    expect(vi.mocked(storage.stat).mock.calls.map(([key]) => key)).toEqual([
      ticket.asset.key,
      copied,
    ]);
    expect(
      vi
        .mocked(storage.remove)
        .mock.calls.map(([key]) => key)
        .sort(),
    ).toEqual([copied, ticket.asset.key].sort());
    await expect(svc.get(ticket.asset.id, admin())).rejects.toThrow(NotFoundError);
  });

  it('refuses a stored object whose type is not the declared one', async () => {
    const storage = fakeStorage({ size: 10, contentType: 'image/png,text/plain' });
    const { svc } = service({ storage });
    const ticket = await svc.requestMemberUpload(
      {
        filename: 'me.png',
        contentType: 'image/png',
      },
      uploader('ou_1'),
    );

    await expect(svc.confirmOwn(ticket.asset.id, uploader('ou_1'))).rejects.toThrow(
      'The uploaded file is not the declared type',
    );
    await expect(svc.get(ticket.asset.id, admin())).rejects.toThrow(NotFoundError);
  });

  it('keeps a pending upload pending without copying when nothing was uploaded', async () => {
    const storage = fakeStorage({ size: 10, contentType: 'image/png' });
    const { svc } = service({ storage });
    const ticket = await svc.requestMemberUpload(
      {
        filename: 'me.png',
        contentType: 'image/png',
      },
      uploader('ou_1'),
    );
    vi.mocked(storage.stat).mockResolvedValueOnce(null);

    expect(await svc.confirmOwn(ticket.asset.id, uploader('ou_1'))).toMatchObject({
      status: 'pending',
    });
    expect(storage.copy).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('returns the current row and keeps the final object when another finalize won', async () => {
    const storage = fakeStorage({ size: 10, contentType: 'image/png' });
    const { svc, repo, assets } = service({ storage });
    const ticket = await svc.requestMemberUpload(
      {
        filename: 'me.png',
        contentType: 'image/png',
      },
      uploader('ou_1'),
    );
    const finalKey = `org/org-1/image/${ticket.asset.id}/me.png`;
    repo.markReady = async () => {
      Object.assign(assets[0]!, { status: 'ready', key: finalKey, size: 10 });
      return null;
    };

    const result = await svc.confirmOwn(ticket.asset.id, uploader('ou_1'));

    expect(result).toMatchObject({ status: 'ready', key: finalKey });
    expect(storage.copy).toHaveBeenCalledWith({ from: ticket.asset.key, to: finalKey });
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('propagates a storage failure during finalize', async () => {
    const storage = fakeStorage({ size: 10, contentType: 'image/png' });
    const { svc } = service({ storage });
    const ticket = await svc.requestMemberUpload(
      {
        filename: 'me.png',
        contentType: 'image/png',
      },
      uploader('ou_1'),
    );
    vi.mocked(storage.copy).mockRejectedValue(new Error('copy failed'));

    await expect(svc.confirmOwn(ticket.asset.id, uploader('ou_1'))).rejects.toThrow('copy failed');
    expect(storage.remove).not.toHaveBeenCalled();
    expect(await svc.get(ticket.asset.id, admin())).toMatchObject({ status: 'pending' });
  });

  it('sweeps stray objects under the uploads prefix that no asset holds once the ticket has expired', async () => {
    const storage = fakeStorage();
    const { svc, assets, appended } = service({ storage });
    const now = new Date('2026-10-22T12:00:00Z');
    const expired = '2026-10-22T11:54:00Z';
    const live = '2026-10-22T11:58:00Z';
    const base = {
      orgId: 'org-1',
      kind: 'image' as const,
      source: 'member' as const,
      filename: 'me.png',
      contentType: 'image/png',
      size: 10,
      uploadedBy: 'ou_1',
      contentId: null,
      createdAt: now,
      updatedAt: now,
    };
    assets.push(
      {
        ...base,
        id: 'ast_pending',
        key: 'org/org-1/uploads/ast_pending/me.png',
        status: 'pending',
      },
      { ...base, id: 'ast_ready', key: 'org/org-1/uploads/ast_ready/me.png', status: 'ready' },
    );
    vi.mocked(storage.list).mockImplementation(async (prefix) =>
      prefix.startsWith('public/') ? [] : uploadsListing,
    );
    const uploadsListing = [
      { key: 'org/org-1/uploads/ast_pending/me.png', size: 10, lastModified: expired },
      { key: 'org/org-1/uploads/ast_ready/me.png', size: 10, lastModified: expired },
      { key: 'org/org-1/uploads/ast_refused/me.png', size: 10, lastModified: expired },
      { key: 'org/org-1/uploads/ast_recent/me.png', size: 10, lastModified: live },
      { key: 'org/org-1/uploads/ast_undated/me.png', size: 10 },
    ];

    expect(await svc.removeUnattached('org-1', now)).toBe(1);

    expect(storage.list).toHaveBeenCalledWith('org/org-1/uploads/');
    expect(vi.mocked(storage.remove).mock.calls).toEqual([
      ['org/org-1/uploads/ast_refused/me.png'],
    ]);
    expect(assets.map((a) => a.id)).toEqual(['ast_pending', 'ast_ready']);
    expect(appended).toEqual([]);
  });

  it('is idle when no row and no stray upload is due', async () => {
    const storage = fakeStorage();
    const { svc } = service({ storage });
    vi.mocked(storage.list).mockImplementation(async (prefix) =>
      prefix.startsWith('public/')
        ? []
        : [
            {
              key: 'org/org-1/uploads/ast_recent/me.png',
              size: 10,
              lastModified: '2026-10-22T11:58:00Z',
            },
          ],
    );
    expect(await svc.removeUnattached('org-1', new Date('2026-10-22T12:00:00Z'))).toBe(0);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('refuses a member image cap that is not a positive integer', () => {
    for (const memberImageMaxBytes of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => service({ memberImageMaxBytes })).toThrow('invalid memberImageMaxBytes');
    }
    for (const memberFileMaxBytes of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => service({ memberFileMaxBytes })).toThrow('invalid memberFileMaxBytes');
    }
  });

  it('refuses a link window that is not a positive integer', () => {
    const { repo } = fakeRepo();
    const { uow } = fakeUow(repo);
    for (const linkWindowSeconds of [0, -1, 1.5, Number.NaN]) {
      expect(
        () =>
          new AssetsServiceImpl({
            storage: fakeStorage(),
            repo,
            uow,
            memberImageMaxBytes: 1000,
            memberFileMaxBytes: 4000,
            linkWindowSeconds,
          }),
      ).toThrow('invalid linkWindowSeconds');
    }
  });

  it('signs the URL of a ready library asset and none for a pending one', async () => {
    const { svc, storage } = service({
      storage: fakeStorage({ size: 10, contentType: 'image/png' }),
    });
    const ticket = await svc.requestUpload(
      { filename: 'a.png', contentType: 'image/png' },
      admin('ou_staff'),
    );
    expect(ticket.asset.url).toBeNull();
    expect((await svc.get(ticket.asset.id, admin()))?.url).toBeNull();
    expect((await svc.list({ page: 1, pageSize: 20 }, admin())).rows[0]?.url).toBeNull();

    const confirmed = await svc.confirm(ticket.asset.id, admin());

    expect(confirmed?.url).toBe('https://storage/download');
    expect((await svc.get(ticket.asset.id, admin()))?.url).toBe('https://storage/download');
    expect((await svc.list({ page: 1, pageSize: 20 }, admin())).rows[0]?.url).toBe(
      'https://storage/download',
    );
    expect(confirmed?.downloadUrl).toBe('https://storage/download');
    expect(ticket.asset.downloadUrl).toBeNull();
    expect(storage.presignDownload).toHaveBeenCalledWith(
      expect.objectContaining({ key: confirmed?.key, downloadFilename: 'a.png' }),
    );
  });

  it('lists member uploads to staff without a URL', async () => {
    const { svc } = service({ storage: fakeStorage({ size: 10, contentType: 'image/png' }) });
    const member = await svc.requestMemberUpload(
      {
        filename: 'me.png',
        contentType: 'image/png',
      },
      uploader('ou_1'),
    );
    const own = await svc.confirmOwn(member.asset.id, uploader('ou_1'));

    expect(own?.url).toBe('https://storage/download');
    const listed = await svc.list({ page: 1, pageSize: 20, source: 'member' }, admin());
    expect(listed.rows.map((a) => [a.status, a.url, a.downloadUrl])).toEqual([
      ['ready', null, null],
    ]);
  });

  it('reports ready files of the org with their name, type and size', async () => {
    const { svc, assets } = service();
    const now = new Date();
    const base = {
      kind: 'document' as const,
      source: 'library' as const,
      contentType: 'application/pdf',
      uploadedBy: 'ou_1',
      contentId: null,
      createdAt: now,
      updatedAt: now,
    };
    assets.push(
      {
        ...base,
        orgId: 'org-1',
        id: 'ast_ready',
        key: 'k1',
        filename: 'a.pdf',
        size: 10,
        status: 'ready',
      },
      {
        ...base,
        orgId: 'org-1',
        id: 'ast_pending',
        key: 'k2',
        filename: 'b.pdf',
        size: 0,
        status: 'pending',
      },
      {
        ...base,
        orgId: 'org-2',
        id: 'ast_other',
        key: 'k3',
        filename: 'c.pdf',
        size: 5,
        status: 'ready',
      },
    );

    expect(
      await svc.readyFiles('org-1', ['ast_ready', 'ast_pending', 'ast_other', 'ast_missing']),
    ).toEqual({
      ast_ready: { filename: 'a.pdf', contentType: 'application/pdf', size: 10 },
    });
    expect(await svc.readyFiles('org-1', [])).toEqual({});
  });

  it('signs ready files of the org for the window they are asked in and the next', async () => {
    let clock = new Date('2026-11-11T07:30:00Z');
    const { svc, assets, storage } = service({ now: () => clock });
    vi.mocked(storage.presignDownload).mockImplementation(
      async ({ key, downloadFilename, signedAt, expiresAt }) =>
        `https://signed/${key}?as=${downloadFilename ?? ''}&from=${signedAt.toISOString()}&to=${expiresAt.toISOString()}`,
    );
    const now = new Date();
    assets.push({
      orgId: 'org-1',
      id: 'ast_guide',
      key: 'k-guide',
      kind: 'document',
      source: 'library',
      filename: 'guide.pdf',
      contentType: 'application/pdf',
      size: 100,
      status: 'ready',
      uploadedBy: 'ou_1',
      contentId: null,
      createdAt: now,
      updatedAt: now,
    });

    const links = await svc.fileLinks('org-1', [
      { assetId: 'ast_guide', saveAs: 'Workbook.pdf' },
      { assetId: 'ast_missing' },
    ]);
    expect(links).toEqual({
      ast_guide:
        'https://signed/k-guide?as=Workbook.pdf&from=2026-11-11T06:00:00.000Z&to=2026-11-11T18:00:00.000Z',
    });
    expect(storage.presignDownload).toHaveBeenLastCalledWith({
      key: 'k-guide',
      downloadFilename: 'Workbook.pdf',
      signedAt: new Date('2026-11-11T06:00:00Z'),
      expiresAt: new Date('2026-11-11T18:00:00Z'),
    });

    clock = new Date('2026-11-11T11:59:59Z');
    expect(
      await svc.fileLinks('org-1', [{ assetId: 'ast_guide', saveAs: 'Workbook.pdf' }]),
    ).toEqual(links);
    clock = new Date('2026-11-11T12:00:00Z');
    expect((await svc.fileLinks('org-1', [{ assetId: 'ast_guide' }])).ast_guide).toBe(
      'https://signed/k-guide?as=&from=2026-11-11T12:00:00.000Z&to=2026-11-12T00:00:00.000Z',
    );
    expect(await svc.fileLinks('org-2', [{ assetId: 'ast_guide' }])).toEqual({});
    expect(await svc.fileLinks('org-1', [])).toEqual({});
  });

  it('returns signed links with a library file to staff, and with an upload to its uploader', async () => {
    const { svc, storage } = service();
    vi.mocked(storage.presignDownload).mockImplementation(
      async ({ key, downloadFilename }) => `https://signed/${key}?as=${downloadFilename ?? ''}`,
    );
    vi.mocked(storage.stat).mockResolvedValue({ key: 'k', size: 50, contentType: 'image/png' });
    const library = await svc.requestUpload(
      { filename: 'a.png', contentType: 'image/png' },
      admin('ou_1'),
    );
    const confirmed = await svc.confirm(library.asset.id, admin());
    const member = await svc.requestMemberUpload(
      {
        filename: 'me.png',
        contentType: 'image/png',
      },
      uploader('ou_1'),
    );
    const own = await svc.confirmOwn(member.asset.id, uploader('ou_1'));

    expect(confirmed.url).toBe(`https://signed/${confirmed.key}?as=`);
    expect(confirmed.downloadUrl).toBe(`https://signed/${confirmed.key}?as=a.png`);
    expect(own.url).toBe(`https://signed/${own.key}?as=`);
    expect(own.downloadUrl).toBeNull();
    const listed = await svc.list({ page: 1, pageSize: 20, source: 'member' }, admin());
    expect(listed.rows.map((row) => [row.url, row.downloadUrl])).toEqual([[null, null]]);
  });
});

describe('public images', () => {
  const now = new Date('2026-11-08T12:00:00Z');
  const image: Asset = {
    orgId: 'org-1',
    id: 'ast_cover',
    kind: 'image',
    source: 'library',
    status: 'ready',
    key: 'org/org-1/image/ast_cover/cover.png',
    filename: 'cover.png',
    contentType: 'image/png',
    size: 10,
    uploadedBy: 'ou_1',
    contentId: null,
    createdAt: now,
    updatedAt: now,
  };

  function withImage() {
    const storage = fakeStorage();
    const built = service({ storage });
    built.assets.push({ ...image });
    return { ...built, storage };
  }

  it('publishes the wanted image under its owner and removes any other copy there', async () => {
    const { svc, storage } = withImage();
    vi.mocked(storage.list).mockResolvedValue([{ key: 'public/org-1/crs_1/ast_old', size: 5 }]);
    await svc.syncPublicImages('org-1', 'crs_1', ['ast_cover']);
    expect(storage.list).toHaveBeenCalledWith('public/org-1/crs_1/');
    expect(storage.remove).toHaveBeenCalledWith('public/org-1/crs_1/ast_old');
    expect(storage.publish).toHaveBeenCalledWith({
      from: 'org/org-1/image/ast_cover/cover.png',
      to: 'public/org-1/crs_1/ast_cover',
    });
  });

  it('changes nothing when the wanted copy is already there', async () => {
    const { svc, storage } = withImage();
    vi.mocked(storage.list).mockResolvedValue([{ key: 'public/org-1/crs_1/ast_cover', size: 10 }]);
    await svc.syncPublicImages('org-1', 'crs_1', ['ast_cover']);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(storage.publish).not.toHaveBeenCalled();
  });

  it('keeps several images under one owner and publishes the ones missing', async () => {
    const { svc, storage, assets } = withImage();
    assets.push({ ...image, id: 'ast_icon', key: 'org/org-1/image/ast_icon/icon.png' });
    vi.mocked(storage.list).mockResolvedValue([
      { key: 'public/org-1/spc_1/ast_cover', size: 10 },
      { key: 'public/org-1/spc_1/ast_old', size: 10 },
    ]);
    await svc.syncPublicImages('org-1', 'spc_1', ['ast_cover', 'ast_icon']);
    expect(vi.mocked(storage.remove).mock.calls).toEqual([['public/org-1/spc_1/ast_old']]);
    expect(vi.mocked(storage.publish).mock.calls).toEqual([
      [{ from: 'org/org-1/image/ast_icon/icon.png', to: 'public/org-1/spc_1/ast_icon' }],
    ]);
  });

  it('removes every copy when nothing should be public', async () => {
    const { svc, storage } = withImage();
    vi.mocked(storage.list).mockResolvedValue([{ key: 'public/org-1/crs_1/ast_cover', size: 10 }]);
    await svc.syncPublicImages('org-1', 'crs_1', []);
    expect(storage.remove).toHaveBeenCalledWith('public/org-1/crs_1/ast_cover');
    expect(storage.publish).not.toHaveBeenCalled();
  });

  it('publishes only a ready image of the org, and never throws on a storage failure', async () => {
    const { svc, storage, assets } = withImage();
    assets.push({ ...image, id: 'ast_pdf', kind: 'document', contentType: 'application/pdf' });
    await svc.syncPublicImages('org-1', 'crs_1', ['ast_pdf']);
    await svc.syncPublicImages('org-1', 'crs_1', ['ast_missing']);
    expect(storage.publish).not.toHaveBeenCalled();
    vi.mocked(storage.list).mockRejectedValue(new Error('storage down'));
    await expect(svc.syncPublicImages('org-1', 'crs_1', ['ast_cover'])).resolves.toBeUndefined();
  });

  it('removes the public copies of an asset when the asset is removed', async () => {
    const { svc, storage } = withImage();
    vi.mocked(storage.list).mockResolvedValue([
      { key: 'public/org-1/crs_1/ast_cover', size: 10 },
      { key: 'public/org-1/crs_2/ast_other', size: 10 },
    ]);
    await svc.remove('ast_cover', admin());
    expect(storage.remove).toHaveBeenCalledWith('public/org-1/crs_1/ast_cover');
    expect(storage.remove).not.toHaveBeenCalledWith('public/org-1/crs_2/ast_other');
  });

  it('sweeps public copies whose asset is gone', async () => {
    const { svc, storage } = withImage();
    vi.mocked(storage.list).mockImplementation(async (prefix) =>
      prefix === 'public/org-1/'
        ? [
            { key: 'public/org-1/crs_1/ast_cover', size: 10 },
            { key: 'public/org-1/pst_9/ast_gone', size: 10 },
          ]
        : [],
    );
    expect(await svc.removeUnattached('org-1', now)).toBe(1);
    expect(vi.mocked(storage.remove).mock.calls).toEqual([['public/org-1/pst_9/ast_gone']]);
  });

  it('builds a public image URL from the public key', () => {
    const urls = createFileUrls((key) => `https://cdn.test/${key}`);
    expect(urls.publicImage('org-1', 'ou_1', 'ast_me')).toBe(
      'https://cdn.test/public/org-1/ou_1/ast_me',
    );
  });
});

describe('AssetsService permissions', () => {
  const james = actorWith({ id: 'ou_james', content: { crs_1: ['courses:write'] } });

  it('lets James upload and confirm for crs_1 and records the item on the asset', async () => {
    const { svc } = service();
    const ticket = await svc.requestUpload(
      { filename: 'a.mp4', contentType: 'video/mp4', contentId: 'crs_1' },
      james,
    );
    expect(ticket.asset.contentId).toBe('crs_1');
    expect(ticket.asset.uploadedBy).toBe('ou_james');
    const confirmed = await svc.confirm(ticket.asset.id, james);
    expect(confirmed?.status).toBe('ready');
    expect((await svc.get(ticket.asset.id, james)).url).toBe('https://storage/download');
  });

  it('refuses James an upload for crs_2, for a download, or to the library', async () => {
    const { svc } = service();
    await expect(
      svc.requestUpload({ filename: 'a.mp4', contentType: 'video/mp4', contentId: 'crs_2' }, james),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      svc.requestUpload({ filename: 'a.mp4', contentType: 'video/mp4', contentId: 'dl_1' }, james),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      svc.requestUpload({ filename: 'a.mp4', contentType: 'video/mp4' }, james),
    ).rejects.toThrow(ForbiddenError);
  });

  it('answers 404 for an unknown item, to media:write holders too, and stores nothing', async () => {
    const { svc, assets } = service();
    for (const actor of [admin(), james]) {
      await expect(
        svc.requestUpload(
          { filename: 'a.mp4', contentType: 'video/mp4', contentId: 'crs_typo' },
          actor,
        ),
      ).rejects.toThrow(NotFoundError);
    }
    expect(assets).toEqual([]);
  });

  it('refuses James a library file or a file uploaded for another course', async () => {
    const { svc } = service();
    const library = await svc.requestUpload(
      { filename: 'a.png', contentType: 'image/png' },
      admin(),
    );
    const other = await svc.requestUpload(
      { filename: 'b.png', contentType: 'image/png', contentId: 'crs_2' },
      admin(),
    );
    await expect(svc.get(library.asset.id, james)).rejects.toThrow(ForbiddenError);
    await expect(svc.confirm(other.asset.id, james)).rejects.toThrow(ForbiddenError);
    await expect(svc.get(other.asset.id, james)).rejects.toThrow(ForbiddenError);
  });

  it('lists the whole library to media:read, otherwise only what was uploaded for the item', async () => {
    const { svc } = service();
    await svc.requestUpload({ filename: 'a.png', contentType: 'image/png' }, admin());
    await svc.requestUpload(
      { filename: 'b.png', contentType: 'image/png', contentId: 'crs_1' },
      james,
    );
    expect((await svc.list({ page: 1, pageSize: 20 }, admin())).rows).toHaveLength(2);
    const forItem = await svc.list({ page: 1, pageSize: 20, contentId: 'crs_1' }, james);
    expect(forItem.rows.map((row) => row.filename)).toEqual(['b.png']);
    await expect(svc.list({ page: 1, pageSize: 20 }, james)).rejects.toThrow(ForbiddenError);
    await expect(svc.list({ page: 1, pageSize: 20, contentId: 'crs_2' }, james)).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('needs media:delete to delete from the library', async () => {
    const { svc } = service();
    const ticket = await svc.requestUpload(
      { filename: 'a.png', contentType: 'image/png', contentId: 'crs_1' },
      james,
    );
    await expect(svc.remove(ticket.asset.id, james)).rejects.toThrow(ForbiddenError);
    await expect(svc.remove(ticket.asset.id, admin())).resolves.toBeUndefined();
  });

  it('refuses every permission-declared method to an actor who holds nothing', async () => {
    const { svc } = service();
    const ticket = await svc.requestUpload(
      { filename: 'a.png', contentType: 'image/png' },
      admin(),
    );
    const nobody = uploader('ou_nobody');
    await expect(
      svc.requestUpload({ filename: 'a.png', contentType: 'image/png' }, nobody),
    ).rejects.toThrow(ForbiddenError);
    await expect(svc.confirm(ticket.asset.id, nobody)).rejects.toThrow(ForbiddenError);
    await expect(svc.get(ticket.asset.id, nobody)).rejects.toThrow(ForbiddenError);
    await expect(svc.list({ page: 1, pageSize: 20 }, nobody)).rejects.toThrow(ForbiddenError);
    await expect(svc.remove(ticket.asset.id, nobody)).rejects.toThrow(ForbiddenError);
  });
});
