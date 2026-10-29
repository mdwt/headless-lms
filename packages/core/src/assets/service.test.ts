import { describe, it, expect, vi } from 'vitest';
import { createFileUrls } from './file-urls.js';
import { AssetsServiceImpl, kindOf } from './service.js';
import type { AssetsRepository, AssetsUnitOfWork } from './ports.js';
import type { Asset } from './model.js';
import type { NewDomainEvent, ObjectStorage, OutboxAppender } from '../shared/ports.js';
import { createCapturingLogger } from '../shared/logger.js';
import { ConflictError } from '../shared/errors.js';

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
      const rows = assets.filter((a) => !query.source || a.source === query.source);
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
    async hasUnreferencedMemberUploads(_orgId, before) {
      return assets.some(
        (a) => a.source === 'member' && !referenced.has(a.id) && a.createdAt < before,
      );
    },
    async listUnreferencedMemberUploads(_orgId, before) {
      return assets.filter(
        (a) => a.source === 'member' && !referenced.has(a.id) && a.createdAt < before,
      );
    },
    async heldKeys(_orgId, keys) {
      return keys.filter((key) => assets.some((a) => a.key === key));
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
    await svc.requestMemberUpload('org-1', 'ou_2', {
      filename: 'me.png',
      contentType: 'image/png',
    });

    const library = await svc.list('org-1', { page: 1, pageSize: 20 });
    expect(library.rows.map((a) => a.source)).toEqual(['library']);
    const member = await svc.list('org-1', { page: 1, pageSize: 20, source: 'member' });
    expect(member.rows.map((a) => a.source)).toEqual(['member']);
  });

  it('refuses a member upload that is not a raster image', async () => {
    const { svc } = service();
    for (const contentType of ['application/pdf', 'image/svg+xml', 'image/tiff']) {
      await expect(
        svc.requestMemberUpload('org-1', 'ou_1', { filename: 'a', contentType }),
      ).rejects.toThrow('A member upload must be a PNG, JPEG, GIF, WebP or AVIF image');
    }
    for (const contentType of [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/avif',
    ]) {
      const ticket = await svc.requestMemberUpload('org-1', 'ou_1', { filename: 'a', contentType });
      expect(ticket.asset.contentType).toBe(contentType);
    }
  });

  it('discards a member upload recorded with an SVG type when it is finalized', async () => {
    const { svc, storage } = service({
      storage: fakeStorage({ size: 10, contentType: 'image/svg+xml' }),
    });
    const ticket = await svc.requestUpload('org-1', {
      filename: 'me.svg',
      contentType: 'image/svg+xml',
      source: 'member',
      uploadedBy: 'ou_1',
    });
    await expect(svc.confirmOwn('org-1', ticket.asset.id, 'ou_1')).rejects.toThrow(
      'A member upload must be a PNG, JPEG, GIF, WebP or AVIF image',
    );
    expect(storage.remove).toHaveBeenCalled();
    expect(await svc.get('org-1', ticket.asset.id)).toBeNull();
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
    await expect(big.svc.confirmOwn('org-1', ticket.asset.id, 'ou_1')).rejects.toThrow(
      'This image is too large',
    );
    expect(big.storage.remove).toHaveBeenCalledWith(ticket.asset.key);
    expect(await big.svc.get('org-1', ticket.asset.id)).toBeNull();
    expect(big.appended.map((e) => e.type)).toEqual(['asset.created', 'asset.deleted']);

    const fake = service({ storage: fakeStorage({ size: 10, contentType: 'application/zip' }) });
    const spoofed = await fake.svc.requestMemberUpload('org-1', 'ou_1', {
      filename: 'me.png',
      contentType: 'image/png',
    });
    await expect(fake.svc.confirmOwn('org-1', spoofed.asset.id, 'ou_1')).rejects.toThrow(
      'The uploaded file is not the declared type',
    );
    expect(await fake.svc.get('org-1', spoofed.asset.id)).toBeNull();
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

    expect(await svc.hasUnattached('org-1', now)).toBe(true);
    expect(await svc.removeUnattached('org-1', now)).toBe(1);
    expect(assets.map((a) => a.id)).toEqual(['asset_kept', 'asset_lib', 'asset_recent']);
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(appended.map((e) => e.type)).toEqual(['asset.deleted']);
    expect(await svc.hasUnattached('org-1', now)).toBe(false);
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
      createdAt: old,
      updatedAt: old,
    });
    repo.delete = async () => {
      throw new ConflictError('This file is still in use');
    };

    expect(await svc.removeUnattached('org-1', new Date('2026-10-22T00:00:00Z'))).toBe(0);
    expect(storage.remove).not.toHaveBeenCalled();
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
    const ticket = await svc.requestUpload('org-1', {
      filename: 'a.mp4',
      contentType: 'video/mp4',
      source: 'library',
      uploadedBy: 'ou_1',
    });

    expect(await svc.remove('org-1', ticket.asset.id)).toBe(true);
    expect(order).toEqual(['row', 'object']);
  });

  it('finalizes a member upload under a key the upload ticket does not cover', async () => {
    const { svc, storage } = service({
      storage: fakeStorage({ size: 10, contentType: 'image/png' }),
    });
    const ticket = await svc.requestMemberUpload('org-1', 'ou_1', {
      filename: 'me.png',
      contentType: 'image/png',
    });

    const confirmed = await svc.confirmOwn('org-1', ticket.asset.id, 'ou_1');

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
    const ticket = await svc.requestMemberUpload('org-1', 'ou_1', {
      filename: 'me.png',
      contentType: 'image/png',
    });
    const confirmed = await svc.confirmOwn('org-1', ticket.asset.id, 'ou_1');
    vi.mocked(storage.stat).mockResolvedValue({ key: 'k', size: 5000, contentType: 'image/png' });
    vi.mocked(storage.remove).mockClear();

    const again = await svc.confirmOwn('org-1', ticket.asset.id, 'ou_1');

    expect(again).toEqual(confirmed);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(await svc.get('org-1', ticket.asset.id)).not.toBeNull();
    expect(appended.map((e) => e.type)).toEqual(['asset.created', 'asset.ready']);
  });

  it('re-derives the kind from the stored content type when an upload is confirmed', async () => {
    const { svc } = service({ storage: fakeStorage({ size: 42, contentType: 'video/mp4' }) });
    const ticket = await svc.requestUpload('org-1', {
      filename: 'clip',
      contentType: 'application/octet-stream',
      source: 'library',
      uploadedBy: 'ou_1',
    });
    expect(ticket.asset.kind).toBe('document');

    const confirmed = await svc.confirm('org-1', ticket.asset.id);

    expect(confirmed).toMatchObject({ kind: 'video', contentType: 'video/mp4', size: 42 });
  });

  it('refuses staff the finalize and the URL of a member upload but lets them delete it', async () => {
    const { svc } = service({ storage: fakeStorage({ size: 10, contentType: 'image/png' }) });
    const library = await svc.requestUpload('org-1', {
      filename: 'a.png',
      contentType: 'image/png',
      source: 'library',
      uploadedBy: 'ou_staff',
    });
    const member = await svc.requestMemberUpload('org-1', 'ou_1', {
      filename: 'me.png',
      contentType: 'image/png',
    });

    await expect(svc.confirm('org-1', member.asset.id)).rejects.toThrow(
      'Only the uploader can finalize a member upload',
    );
    await svc.confirm('org-1', library.asset.id);
    await svc.confirmOwn('org-1', member.asset.id, 'ou_1');
    expect((await svc.get('org-1', member.asset.id))?.url).toBeNull();
    expect((await svc.get('org-1', library.asset.id))?.url).toMatch(
      /\/api\/assets\/ast_\w+\/file$/,
    );
    expect(await svc.remove('org-1', member.asset.id)).toBe(true);
  });

  it('answers which ids are ready library assets of the org, in the order asked', async () => {
    const { svc } = service({ storage: fakeStorage({ size: 10, contentType: 'image/png' }) });
    const upload = (filename: string) =>
      svc.requestUpload('org-1', {
        filename,
        contentType: 'image/png',
        source: 'library',
        uploadedBy: 'ou_staff',
      });
    const first = await upload('a.png');
    const second = await upload('b.png');
    const pending = await upload('c.png');
    const member = await svc.requestMemberUpload('org-1', 'ou_1', {
      filename: 'me.png',
      contentType: 'image/png',
    });
    await svc.confirm('org-1', first.asset.id);
    await svc.confirm('org-1', second.asset.id);
    await svc.confirmOwn('org-1', member.asset.id, 'ou_1');

    expect(
      await svc.libraryAssetsAmong('org-1', [
        second.asset.id,
        pending.asset.id,
        member.asset.id,
        'ast_missing',
        first.asset.id,
      ]),
    ).toEqual([second.asset.id, first.asset.id]);
  });

  it('checks the copied object, which the upload ticket cannot replace', async () => {
    const storage = fakeStorage();
    vi.mocked(storage.stat).mockImplementation(async (key: string) =>
      key.includes('/uploads/')
        ? { key, size: 10, contentType: 'image/png' }
        : { key, size: 5000, contentType: 'image/png' },
    );
    const { svc } = service({ storage });
    const ticket = await svc.requestMemberUpload('org-1', 'ou_1', {
      filename: 'me.png',
      contentType: 'image/png',
    });

    await expect(svc.confirmOwn('org-1', ticket.asset.id, 'ou_1')).rejects.toThrow(
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
    expect(await svc.get('org-1', ticket.asset.id)).toBeNull();
  });

  it('refuses a stored object whose type is not the declared one', async () => {
    const storage = fakeStorage({ size: 10, contentType: 'image/png,text/plain' });
    const { svc } = service({ storage });
    const ticket = await svc.requestMemberUpload('org-1', 'ou_1', {
      filename: 'me.png',
      contentType: 'image/png',
    });

    await expect(svc.confirmOwn('org-1', ticket.asset.id, 'ou_1')).rejects.toThrow(
      'The uploaded file is not the declared type',
    );
    expect(await svc.get('org-1', ticket.asset.id)).toBeNull();
  });

  it('keeps a pending upload pending without copying when nothing was uploaded', async () => {
    const storage = fakeStorage({ size: 10, contentType: 'image/png' });
    const { svc } = service({ storage });
    const ticket = await svc.requestMemberUpload('org-1', 'ou_1', {
      filename: 'me.png',
      contentType: 'image/png',
    });
    vi.mocked(storage.stat).mockResolvedValueOnce(null);

    expect(await svc.confirmOwn('org-1', ticket.asset.id, 'ou_1')).toMatchObject({
      status: 'pending',
    });
    expect(storage.copy).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('returns the current row and keeps the final object when another finalize won', async () => {
    const storage = fakeStorage({ size: 10, contentType: 'image/png' });
    const { svc, repo, assets } = service({ storage });
    const ticket = await svc.requestMemberUpload('org-1', 'ou_1', {
      filename: 'me.png',
      contentType: 'image/png',
    });
    const finalKey = `org/org-1/image/${ticket.asset.id}/me.png`;
    repo.markReady = async () => {
      Object.assign(assets[0]!, { status: 'ready', key: finalKey, size: 10 });
      return null;
    };

    const result = await svc.confirmOwn('org-1', ticket.asset.id, 'ou_1');

    expect(result).toMatchObject({ status: 'ready', key: finalKey });
    expect(storage.copy).toHaveBeenCalledWith({ from: ticket.asset.key, to: finalKey });
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('propagates a storage failure during finalize', async () => {
    const storage = fakeStorage({ size: 10, contentType: 'image/png' });
    const { svc } = service({ storage });
    const ticket = await svc.requestMemberUpload('org-1', 'ou_1', {
      filename: 'me.png',
      contentType: 'image/png',
    });
    vi.mocked(storage.copy).mockRejectedValue(new Error('copy failed'));

    await expect(svc.confirmOwn('org-1', ticket.asset.id, 'ou_1')).rejects.toThrow('copy failed');
    expect(storage.remove).not.toHaveBeenCalled();
    expect(await svc.get('org-1', ticket.asset.id)).toMatchObject({ status: 'pending' });
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

    expect(await svc.hasUnattached('org-1', now)).toBe(true);
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
    expect(await svc.hasUnattached('org-1', new Date('2026-10-22T12:00:00Z'))).toBe(false);
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
    const ticket = await svc.requestUpload('org-1', {
      filename: 'a.png',
      contentType: 'image/png',
      source: 'library',
      uploadedBy: 'ou_staff',
    });
    expect(ticket.asset.url).toBeNull();
    expect((await svc.get('org-1', ticket.asset.id))?.url).toBeNull();
    expect((await svc.list('org-1', { page: 1, pageSize: 20 })).rows[0]?.url).toBeNull();

    const confirmed = await svc.confirm('org-1', ticket.asset.id);

    expect(confirmed?.url).toMatch(/\/api\/assets\/ast_\w+\/file$/);
    expect((await svc.get('org-1', ticket.asset.id))?.url).toMatch(/\/api\/assets\/ast_\w+\/file$/);
    expect((await svc.list('org-1', { page: 1, pageSize: 20 })).rows[0]?.url).toMatch(
      /\/api\/assets\/ast_\w+\/file$/,
    );
    expect(confirmed?.downloadUrl).toMatch(/\/api\/assets\/ast_\w+\/download$/);
    expect(ticket.asset.downloadUrl).toBeNull();
    expect(storage.presignDownload).not.toHaveBeenCalled();
  });

  it('lists member uploads to staff without a URL', async () => {
    const { svc } = service({ storage: fakeStorage({ size: 10, contentType: 'image/png' }) });
    const member = await svc.requestMemberUpload('org-1', 'ou_1', {
      filename: 'me.png',
      contentType: 'image/png',
    });
    const own = await svc.confirmOwn('org-1', member.asset.id, 'ou_1');

    expect(own?.url).toMatch(/\/api\/member\/uploads\/ast_\w+\/file$/);
    const listed = await svc.list('org-1', { page: 1, pageSize: 20, source: 'member' });
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
    const library = await svc.requestUpload('org-1', {
      filename: 'a.png',
      contentType: 'image/png',
      source: 'library',
      uploadedBy: 'ou_1',
    });
    await svc.confirm('org-1', library.asset.id);
    const member = await svc.requestMemberUpload('org-1', 'ou_1', {
      filename: 'me.png',
      contentType: 'image/png',
    });
    await svc.confirmOwn('org-1', member.asset.id, 'ou_1');

    expect(await svc.libraryFile('org-1', library.asset.id, { download: false })).toBe(
      'https://signed',
    );
    expect(await svc.libraryFile('org-1', member.asset.id, { download: false })).toBeNull();
    expect(await svc.ownUploadFile('org-1', member.asset.id, 'ou_1')).toBe('https://signed');
    expect(await svc.ownUploadFile('org-1', member.asset.id, 'ou_2')).toBeNull();
  });
});
