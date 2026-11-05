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
    downloadLinkExpirySeconds: 600,
    fileUrls: createFileUrls('https://api.test'),
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

  it('refuses a member upload that is not a raster image', async () => {
    const { svc } = service();
    for (const contentType of ['application/pdf', 'image/svg+xml', 'image/tiff']) {
      await expect(
        svc.requestMemberUpload({ filename: 'a', contentType }, uploader('ou_1')),
      ).rejects.toThrow('A member upload must be a PNG, JPEG, GIF, WebP or AVIF image');
    }
    for (const contentType of [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/avif',
    ]) {
      const ticket = await svc.requestMemberUpload(
        { filename: 'a', contentType },
        uploader('ou_1'),
      );
      expect(ticket.asset.contentType).toBe(contentType);
    }
  });

  it('discards a member upload recorded with an SVG type when it is finalized', async () => {
    const { svc, storage, assets } = service({
      storage: fakeStorage({ size: 10, contentType: 'image/svg+xml' }),
    });
    const now = new Date();
    assets.push({
      orgId: 'org-1',
      id: 'asset_svg',
      key: 'org/org-1/uploads/asset_svg/me.svg',
      kind: 'image',
      source: 'member',
      filename: 'me.svg',
      contentType: 'image/svg+xml',
      size: 0,
      status: 'pending',
      uploadedBy: 'ou_1',
      contentId: null,
      createdAt: now,
      updatedAt: now,
    });
    await expect(svc.confirmOwn('asset_svg', uploader('ou_1'))).rejects.toThrow(
      'A member upload must be a PNG, JPEG, GIF, WebP or AVIF image',
    );
    expect(storage.remove).toHaveBeenCalled();
    await expect(svc.get('asset_svg', admin())).rejects.toThrow(NotFoundError);
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
      new InvalidInputError('This image is too large'),
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
      downloadLinkExpirySeconds: 600,
      fileUrls: createFileUrls('https://api.test'),
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
      downloadLinkExpirySeconds: 600,
      fileUrls: createFileUrls('https://api.test'),
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
      downloadLinkExpirySeconds: 600,
      fileUrls: createFileUrls('https://api.test'),
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
      downloadLinkExpirySeconds: 600,
      fileUrls: createFileUrls('https://api.test'),
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
        meta: { orgId: 'org-1', count: 1, stray: 0, failed: 1 },
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
    expect(confirmed?.url).toMatch(/\/api\/member\/uploads\/ast_\w+\/file$/);
    expect(storage.presignDownload).not.toHaveBeenCalled();
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
    expect((await svc.get(library.asset.id, admin()))?.url).toMatch(
      /\/api\/assets\/ast_\w+\/file$/,
    );
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
      'This image is too large',
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
    vi.mocked(storage.list).mockResolvedValue([
      { key: 'org/org-1/uploads/ast_pending/me.png', size: 10, lastModified: expired },
      { key: 'org/org-1/uploads/ast_ready/me.png', size: 10, lastModified: expired },
      { key: 'org/org-1/uploads/ast_refused/me.png', size: 10, lastModified: expired },
      { key: 'org/org-1/uploads/ast_recent/me.png', size: 10, lastModified: live },
      { key: 'org/org-1/uploads/ast_undated/me.png', size: 10 },
    ]);

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
    vi.mocked(storage.list).mockResolvedValue([
      {
        key: 'org/org-1/uploads/ast_recent/me.png',
        size: 10,
        lastModified: '2026-10-22T11:58:00Z',
      },
    ]);
    expect(await svc.removeUnattached('org-1', new Date('2026-10-22T12:00:00Z'))).toBe(0);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('refuses a member image cap that is not a positive integer', () => {
    for (const memberImageMaxBytes of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => service({ memberImageMaxBytes })).toThrow('invalid memberImageMaxBytes');
    }
  });

  it('refuses a URL lifetime that is not a positive integer', () => {
    const { repo } = fakeRepo();
    const { uow } = fakeUow(repo);
    for (const downloadLinkExpirySeconds of [0, -1, 1.5, Number.NaN]) {
      expect(
        () =>
          new AssetsServiceImpl({
            storage: fakeStorage(),
            repo,
            uow,
            memberImageMaxBytes: 1000,
            downloadLinkExpirySeconds,
            fileUrls: createFileUrls('https://api.test'),
          }),
      ).toThrow('invalid downloadLinkExpirySeconds');
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

    expect(confirmed?.url).toMatch(/\/api\/assets\/ast_\w+\/file$/);
    expect((await svc.get(ticket.asset.id, admin()))?.url).toMatch(/\/api\/assets\/ast_\w+\/file$/);
    expect((await svc.list({ page: 1, pageSize: 20 }, admin())).rows[0]?.url).toMatch(
      /\/api\/assets\/ast_\w+\/file$/,
    );
    expect(confirmed?.downloadUrl).toMatch(/\/api\/assets\/ast_\w+\/download$/);
    expect(ticket.asset.downloadUrl).toBeNull();
    expect(storage.presignDownload).not.toHaveBeenCalled();
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

    expect(own?.url).toMatch(/\/api\/member\/uploads\/ast_\w+\/file$/);
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

  it('signs a ready file inline with the storage lifetime, and a download with the short one', async () => {
    const { svc, assets, storage } = service();
    vi.mocked(storage.presignDownload).mockImplementation(
      async ({ key, downloadFilename }) => `https://signed/${key}?as=${downloadFilename ?? ''}`,
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

    expect(await svc.signFile('org-1', 'ast_guide')).toBe('https://signed/k-guide?as=');
    expect(storage.presignDownload).toHaveBeenLastCalledWith({ key: 'k-guide' });
    expect(await svc.signFile('org-1', 'ast_guide', { saveAs: 'Workbook.pdf' })).toBe(
      'https://signed/k-guide?as=Workbook.pdf',
    );
    expect(storage.presignDownload).toHaveBeenLastCalledWith({
      key: 'k-guide',
      downloadFilename: 'Workbook.pdf',
      expiresInSeconds: 600,
    });
    expect(await svc.signFile('org-2', 'ast_guide')).toBeNull();
    expect(await svc.signFile('org-1', 'ast_missing')).toBeNull();
  });

  it('serves library files to staff only, and an upload only to its uploader', async () => {
    const { svc, storage } = service();
    vi.mocked(storage.presignDownload).mockResolvedValue('https://signed');
    vi.mocked(storage.stat).mockResolvedValue({ key: 'k', size: 50, contentType: 'image/png' });
    const library = await svc.requestUpload(
      { filename: 'a.png', contentType: 'image/png' },
      admin('ou_1'),
    );
    await svc.confirm(library.asset.id, admin());
    const member = await svc.requestMemberUpload(
      {
        filename: 'me.png',
        contentType: 'image/png',
      },
      uploader('ou_1'),
    );
    await svc.confirmOwn(member.asset.id, uploader('ou_1'));

    expect(await svc.libraryFile(library.asset.id, { download: false }, admin())).toBe(
      'https://signed',
    );
    await expect(svc.libraryFile(member.asset.id, { download: false }, admin())).rejects.toThrow(
      NotFoundError,
    );
    expect(await svc.ownUploadFile(member.asset.id, uploader('ou_1'))).toBe('https://signed');
    await expect(svc.ownUploadFile(member.asset.id, uploader('ou_2'))).rejects.toThrow(
      NotFoundError,
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
    expect(await svc.get(ticket.asset.id, james)).not.toBeNull();
    expect(await svc.libraryFile(ticket.asset.id, { download: false }, james)).toBe(
      'https://storage/download',
    );
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
    await expect(svc.libraryFile(other.asset.id, { download: true }, james)).rejects.toThrow(
      ForbiddenError,
    );
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
    await expect(svc.libraryFile(ticket.asset.id, { download: false }, nobody)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(svc.remove(ticket.asset.id, nobody)).rejects.toThrow(ForbiddenError);
  });
});
