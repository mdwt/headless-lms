import { genId } from '../shared/id.js';
import type { Logger, ObjectStorage } from '../shared/ports.js';
import { PUBLIC_PREFIX } from '../types/index.js';
import {
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
} from '../shared/errors.js';
import type { Actor } from '../shared/actor.js';
import type { AssetSource, ContentType, Permission } from '../types/index.js';
import type {
  Asset,
  AssetKind,
  AssetView,
  AssetsQuery,
  Page,
  RequestUploadInput,
  UploadTicket,
} from './model.js';
import type {
  AssetsRepository,
  AssetsService,
  AssetsUnitOfWork,
  FileLinkRequest,
  MemberUpload,
  MemberUploadInput,
  ReadyFile,
} from './ports.js';
import { publicImageKey, publicImagePrefix } from './file-urls.js';
import { noopLogger } from '../shared/logger.js';
import { assetEvents } from './events.js';

const WRITE_PERMISSION: Record<ContentType, Permission> = {
  course: 'courses:write',
  download: 'downloads:write',
  community: 'communities:write',
  event: 'events:write',
};

const UNATTACHED_UPLOAD_GRACE_MS = 60 * 60 * 1000;

export const MEMBER_IMAGE_TYPE = /^image\/(png|jpeg|gif|webp|avif)$/i;

export function isMemberImageType(contentType: string): boolean {
  return MEMBER_IMAGE_TYPE.test(contentType.trim());
}

export function memberKindOf(contentType: string): AssetKind {
  if (isMemberImageType(contentType)) {
    return 'image';
  }
  const kind = kindOf(contentType);
  return kind === 'image' ? 'document' : kind;
}

export function kindOf(contentType: string): AssetKind {
  const type = contentType.trim().toLowerCase();
  if (type.startsWith('image/')) {
    return 'image';
  }
  if (type.startsWith('video/')) {
    return 'video';
  }
  if (type.startsWith('audio/')) {
    return 'audio';
  }
  return 'document';
}

function orgPrefix(orgId: string): string {
  return `org/${orgId}/`;
}

function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? 'file';
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}

function storedKey(orgId: string, folder: string, id: string, filename: string): string {
  return `${orgPrefix(orgId)}${folder}/${id}/${sanitizeFilename(filename)}`;
}

function finalMemberKey(orgId: string, asset: Asset): string {
  return `${orgPrefix(orgId)}${asset.kind}/${asset.id}/${sanitizeFilename(asset.filename)}`;
}

function graceCutoff(now: Date): Date {
  return new Date(now.getTime() - UNATTACHED_UPLOAD_GRACE_MS);
}

export type AssetsServiceParams = {
  storage: ObjectStorage;
  repo: AssetsRepository;
  uow: AssetsUnitOfWork;
  memberImageMaxBytes: number;
  memberFileMaxBytes: number;
  /** Lifetime of a file link, seconds, from when the read signs it. */
  downloadLinkExpirySeconds: number;
  logger?: Logger;
};

export class AssetsServiceImpl implements AssetsService {
  private readonly storage: ObjectStorage;
  private readonly repo: AssetsRepository;
  private readonly uow: AssetsUnitOfWork;
  private readonly memberImageMaxBytes: number;
  private readonly memberFileMaxBytes: number;
  private readonly downloadLinkExpirySeconds: number;
  private readonly logger: Logger;

  constructor(params: AssetsServiceParams) {
    if (!Number.isSafeInteger(params.memberImageMaxBytes) || params.memberImageMaxBytes <= 0) {
      throw new Error(
        `invalid memberImageMaxBytes "${params.memberImageMaxBytes}" (expected a positive integer)`,
      );
    }
    if (!Number.isSafeInteger(params.memberFileMaxBytes) || params.memberFileMaxBytes <= 0) {
      throw new Error(
        `invalid memberFileMaxBytes "${params.memberFileMaxBytes}" (expected a positive integer)`,
      );
    }
    if (
      !Number.isSafeInteger(params.downloadLinkExpirySeconds) ||
      params.downloadLinkExpirySeconds <= 0
    ) {
      throw new Error(
        `invalid downloadLinkExpirySeconds "${params.downloadLinkExpirySeconds}" (expected a positive integer)`,
      );
    }
    this.storage = params.storage;
    this.repo = params.repo;
    this.uow = params.uow;
    this.memberImageMaxBytes = params.memberImageMaxBytes;
    this.memberFileMaxBytes = params.memberFileMaxBytes;
    this.downloadLinkExpirySeconds = params.downloadLinkExpirySeconds;
    this.logger = params.logger ?? noopLogger;
  }

  async requestUpload(input: RequestUploadInput, actor: Actor): Promise<UploadTicket> {
    const orgId = actor.orgId;
    if (input.contentId === undefined) {
      actor.permissions.require('media:write');
    } else {
      const type = await this.repo.contentTypeOf(orgId, input.contentId);
      if (!type) {
        throw new NotFoundError('Content item', input.contentId);
      }
      if (
        !actor.permissions.has('media:write') &&
        !actor.permissions.has(WRITE_PERMISSION[type], input.contentId)
      ) {
        this.logger.warn('asset upload refused', {
          orgId,
          orgUserId: actor.id,
          contentId: input.contentId,
        });
        throw new ForbiddenError(`You need media:write or ${WRITE_PERMISSION[type]}`);
      }
    }
    return this.createUpload(orgId, {
      filename: input.filename,
      contentType: input.contentType,
      source: 'library',
      uploadedBy: actor.id,
      contentId: input.contentId ?? null,
    });
  }

  async requestMemberUpload(input: MemberUploadInput, actor: Actor): Promise<UploadTicket> {
    return this.createUpload(actor.orgId, {
      filename: input.filename,
      contentType: input.contentType,
      source: 'member',
      uploadedBy: actor.id,
      contentId: null,
    });
  }

  private async createUpload(
    orgId: string,
    input: {
      filename: string;
      contentType: string;
      source: AssetSource;
      uploadedBy: string;
      contentId: string | null;
    },
  ): Promise<UploadTicket> {
    const id = genId('asset');
    const kind =
      input.source === 'member' ? memberKindOf(input.contentType) : kindOf(input.contentType);
    const folder = input.source === 'member' ? 'uploads' : kind;
    const key = storedKey(orgId, folder, id, input.filename);
    const presigned = await this.storage.presignUpload({ key, contentType: input.contentType });
    const now = new Date();
    const asset = await this.uow.run(async ({ assets, outbox }) => {
      const asset = await assets.insert(orgId, {
        orgId,
        id,
        key,
        kind,
        source: input.source,
        filename: input.filename,
        contentType: input.contentType,
        size: 0,
        status: 'pending',
        uploadedBy: input.uploadedBy,
        contentId: input.contentId,
        createdAt: now,
        updatedAt: now,
      });
      await outbox.append([assetEvents.assetCreated.make({ orgId, data: asset })]);
      return asset;
    });
    this.logger.info('asset upload requested', {
      orgId,
      assetId: id,
      kind,
      source: input.source,
      contentId: input.contentId,
    });
    return {
      asset: { ...asset, url: null, downloadUrl: null },
      uploadUrl: presigned.url,
      method: 'PUT',
      expiresInSeconds: presigned.expiresInSeconds,
      headers: presigned.headers,
    };
  }

  async confirm(id: string, actor: Actor): Promise<AssetView> {
    const orgId = actor.orgId;
    const asset = await this.repo.findById(orgId, id);
    if (!asset) {
      throw new NotFoundError('Asset', id);
    }
    await this.requireReach(asset, actor);
    if (asset.source === 'member') {
      throw new ForbiddenError('Only the uploader can finalize a member upload');
    }
    const confirmed = await this.finalize(orgId, asset);
    if (!confirmed) {
      throw new NotFoundError('Asset', id);
    }
    return this.view(confirmed);
  }

  async confirmOwn(id: string, actor: Actor): Promise<AssetView> {
    const orgId = actor.orgId;
    const asset = await this.repo.findById(orgId, id);
    if (!asset || asset.source !== 'member' || asset.uploadedBy !== actor.id) {
      this.logger.debug('upload confirm refused', { orgId, assetId: id, orgUserId: actor.id });
      throw new NotFoundError('Asset', id);
    }
    const confirmed = await this.finalize(orgId, asset);
    if (!confirmed) {
      throw new NotFoundError('Asset', id);
    }
    if (confirmed.status !== 'ready') {
      return { ...confirmed, url: null, downloadUrl: null };
    }
    const links = await this.signReady([confirmed], () => undefined);
    return { ...confirmed, url: links[confirmed.id] ?? null, downloadUrl: null };
  }

  async ownsUpload(orgId: string, assetId: string, orgUserId: string): Promise<boolean> {
    const asset = await this.repo.findById(orgId, assetId);
    return (
      asset !== null &&
      asset.source === 'member' &&
      asset.status === 'ready' &&
      asset.uploadedBy === orgUserId
    );
  }

  async memberUploads(orgId: string, assetIds: string[]): Promise<MemberUpload[]> {
    const ready = await this.readyAmong(orgId, assetIds);
    return ready
      .filter((asset) => asset.source === 'member')
      .map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        filename: asset.filename,
        contentType: asset.contentType,
        size: asset.size,
      }));
  }

  async ownsImage(orgId: string, assetId: string, orgUserId: string): Promise<boolean> {
    const asset = await this.repo.findById(orgId, assetId);
    return (
      asset !== null &&
      asset.source === 'member' &&
      asset.kind === 'image' &&
      asset.status === 'ready' &&
      asset.uploadedBy === orgUserId
    );
  }

  async libraryAssetsFor(
    orgId: string,
    assetIds: string[],
  ): Promise<{ id: string; contentId: string | null }[]> {
    if (assetIds.length === 0) {
      return [];
    }
    const rows = await this.repo.findByIds(orgId, [...new Set(assetIds)]);
    const library = new Map(
      rows
        .filter((a) => a.source === 'library' && a.status === 'ready')
        .map((a) => [a.id, a.contentId]),
    );
    return assetIds.flatMap((id) =>
      library.has(id) ? [{ id, contentId: library.get(id) ?? null }] : [],
    );
  }

  async list(query: AssetsQuery, actor: Actor): Promise<Page<AssetView>> {
    const orgId = actor.orgId;
    if (!actor.permissions.has('media:read')) {
      if (query.contentId === undefined || (query.source ?? 'library') !== 'library') {
        throw new ForbiddenError('You need media:read');
      }
      await this.requireItemWrite(orgId, query.contentId, actor);
    }
    const page = await this.repo.list(orgId, { ...query, source: query.source ?? 'library' });
    return { ...page, rows: await this.views(page.rows) };
  }

  async get(id: string, actor: Actor): Promise<AssetView> {
    const asset = await this.repo.findById(actor.orgId, id);
    if (!asset) {
      throw new NotFoundError('Asset', id);
    }
    await this.requireReach(asset, actor);
    return this.view(asset);
  }

  async readyFiles(orgId: string, assetIds: readonly string[]): Promise<Record<string, ReadyFile>> {
    const ready = await this.readyAmong(orgId, assetIds);
    return Object.fromEntries(
      ready.map((asset) => [
        asset.id,
        { filename: asset.filename, contentType: asset.contentType, size: asset.size },
      ]),
    );
  }

  async fileLinks(
    orgId: string,
    files: readonly FileLinkRequest[],
  ): Promise<Record<string, string>> {
    const saveAs = new Map(files.map((file) => [file.assetId, file.saveAs]));
    const ready = await this.readyAmong(orgId, [...saveAs.keys()]);
    return this.signReady(ready, (asset) => saveAs.get(asset.id));
  }

  private async signReady(
    assets: readonly Asset[],
    saveAs: (asset: Asset) => string | undefined,
  ): Promise<Record<string, string>> {
    const links = await Promise.all(
      assets.map(async (asset) => {
        const filename = saveAs(asset);
        const url = await this.storage.presignDownload({
          key: asset.key,
          expiresInSeconds: this.downloadLinkExpirySeconds,
          ...(filename === undefined ? {} : { downloadFilename: filename }),
        });
        return [asset.id, url] as const;
      }),
    );
    return Object.fromEntries(links);
  }

  async syncPublicImages(
    orgId: string,
    ownerId: string,
    assetIds: readonly string[],
  ): Promise<void> {
    try {
      const wanted = new Map(assetIds.map((id) => [publicImageKey(orgId, ownerId, id), id]));
      const held = await this.storage.list(publicImagePrefix(orgId, ownerId));
      for (const object of held) {
        if (!wanted.has(object.key)) {
          await this.storage.remove(object.key);
        }
      }
      const heldKeys = new Set(held.map((object) => object.key));
      const missing = [...wanted].filter(([key]) => !heldKeys.has(key));
      if (missing.length === 0) {
        return;
      }
      const ready = new Map(
        (
          await this.readyAmong(
            orgId,
            missing.map(([, id]) => id),
          )
        ).map((asset) => [asset.id, asset]),
      );
      for (const [key, assetId] of missing) {
        const asset = ready.get(assetId);
        if (!asset || asset.kind !== 'image') {
          this.logger.warn('public image not published — no ready image', {
            orgId,
            ownerId,
            assetId,
          });
          continue;
        }
        await this.storage.publish({ from: asset.key, to: key });
        this.logger.info('public image published', { orgId, ownerId, assetId });
      }
    } catch (err) {
      this.logger.error('public images not synced', { orgId, ownerId, assetIds, err });
    }
  }

  async remove(id: string, actor: Actor): Promise<void> {
    actor.permissions.require('media:delete');
    await this.removeAsset(actor.orgId, id, actor.id);
  }

  async removeOwn(id: string, actor: Actor): Promise<void> {
    const asset = await this.repo.findById(actor.orgId, id);
    if (!asset || asset.source !== 'member' || asset.uploadedBy !== actor.id) {
      throw new NotFoundError('Asset', id);
    }
    await this.removeAsset(actor.orgId, id, actor.id);
  }

  private async removeAsset(orgId: string, id: string, actorId: string): Promise<void> {
    const asset = await this.repo.findById(orgId, id);
    if (!asset || !(await this.discard(orgId, asset))) {
      throw new NotFoundError('Asset', id);
    }
    this.logger.info('asset removed', { orgId, assetId: id, actorId });
  }

  private async requireReach(asset: Asset, actor: Actor): Promise<void> {
    if (actor.permissions.has('media:read')) {
      return;
    }
    if (asset.contentId === null) {
      this.logger.warn('asset refused', {
        orgId: actor.orgId,
        assetId: asset.id,
        orgUserId: actor.id,
      });
      throw new ForbiddenError('You need media:read');
    }
    await this.requireItemWrite(actor.orgId, asset.contentId, actor);
  }

  private async requireItemWrite(orgId: string, contentId: string, actor: Actor): Promise<void> {
    const type = await this.repo.contentTypeOf(orgId, contentId);
    if (!type || !actor.permissions.has(WRITE_PERMISSION[type], contentId)) {
      this.logger.warn('asset refused', { orgId, contentId, orgUserId: actor.id });
      throw new ForbiddenError(
        type ? `You need media:read or ${WRITE_PERMISSION[type]}` : 'You need media:read',
      );
    }
  }

  async removeUnattached(orgId: string, now: Date): Promise<number> {
    const stale = await this.repo.listUnreferencedMemberUploads(orgId, graceCutoff(now));
    let removed = 0;
    let failed = 0;
    for (const asset of stale) {
      try {
        if (await this.discard(orgId, asset)) {
          removed += 1;
        }
      } catch (err) {
        if (!(err instanceof ConflictError)) {
          failed += 1;
          this.logger.error('unattached upload not removed', { orgId, assetId: asset.id, err });
        }
      }
    }
    const orphans = await this.orphanPublicImages(orgId);
    for (const key of orphans) {
      await this.removeObject(orgId, key.split('/').pop() ?? '', key);
    }
    let stray = 0;
    for (const key of await this.strayUploads(orgId, now)) {
      try {
        await this.storage.remove(key);
        stray += 1;
      } catch (err) {
        failed += 1;
        this.logger.warn('stray upload not removed', { orgId, err });
      }
    }
    if (removed > 0 || stray > 0 || orphans.length > 0 || failed > 0) {
      this.logger.info('unattached uploads removed', {
        orgId,
        count: removed,
        stray,
        publicCopies: orphans.length,
        failed,
      });
    }
    return removed + stray + orphans.length;
  }

  private async orphanPublicImages(orgId: string): Promise<string[]> {
    const objects = await this.storage.list(`${PUBLIC_PREFIX}${orgId}/`);
    if (objects.length === 0) {
      return [];
    }
    const assetIdOf = (key: string) => key.split('/').pop() ?? '';
    const live = new Set(
      (
        await this.readyAmong(
          orgId,
          objects.map((o) => assetIdOf(o.key)),
        )
      ).map((a) => a.id),
    );
    return objects.filter((o) => !live.has(assetIdOf(o.key))).map((o) => o.key);
  }

  private async strayUploads(orgId: string, now: Date): Promise<string[]> {
    const cutoff = now.getTime() - this.storage.uploadExpirySeconds * 1000;
    const objects = await this.storage.list(`${orgPrefix(orgId)}uploads/`);
    const old = objects
      .filter((o) => o.lastModified !== undefined && Date.parse(o.lastModified) < cutoff)
      .map((o) => o.key);
    if (old.length === 0) {
      return [];
    }
    const held = new Set(await this.repo.heldKeys(orgId, old));
    return old.filter((key) => !held.has(key));
  }

  private async finalize(orgId: string, asset: Asset): Promise<Asset | null> {
    if (asset.status !== 'pending') {
      return asset;
    }
    if (asset.source === 'member') {
      return this.finalizeMember(orgId, asset);
    }
    const stat = await this.storage.stat(asset.key);
    if (!stat) {
      this.logger.debug('asset not yet uploaded', { orgId, assetId: asset.id });
      return asset;
    }
    const contentType = stat.contentType ?? asset.contentType;
    const ready = await this.markReady(orgId, asset, {
      key: asset.key,
      kind: kindOf(contentType),
      size: stat.size,
      contentType,
    });
    return ready ?? this.repo.findById(orgId, asset.id);
  }

  private async finalizeMember(orgId: string, asset: Asset): Promise<Asset | null> {
    if (!(await this.storage.stat(asset.key))) {
      this.logger.debug('asset not yet uploaded', { orgId, assetId: asset.id });
      return asset;
    }
    const key = finalMemberKey(orgId, asset);
    await this.storage.copy({ from: asset.key, to: key });
    const stat = await this.storage.stat(key);
    if (!stat) {
      throw new Error('copied upload not found');
    }
    const contentType = asset.contentType;
    const kind = memberKindOf(contentType);
    const limit = kind === 'image' ? this.memberImageMaxBytes : this.memberFileMaxBytes;
    const reason =
      stat.contentType !== undefined && stat.contentType !== contentType
        ? 'The uploaded file is not the declared type'
        : stat.size > limit
          ? `This ${kind === 'image' ? 'image' : 'file'} is over the ${sizeLabel(limit)} limit`
          : null;
    if (reason) {
      await this.removeObject(orgId, asset.id, key);
      await this.discard(orgId, asset);
      this.logger.info('member upload refused', { orgId, assetId: asset.id, reason });
      throw new InvalidInputError(reason);
    }
    const ready = await this.markReady(orgId, asset, { key, kind, size: stat.size, contentType });
    if (!ready) {
      return this.repo.findById(orgId, asset.id);
    }
    await this.removeObject(orgId, asset.id, asset.key);
    return ready;
  }

  private async markReady(
    orgId: string,
    asset: Asset,
    patch: Pick<Asset, 'key' | 'kind' | 'size' | 'contentType'>,
  ): Promise<Asset | null> {
    const updated = await this.uow.run(async ({ assets, outbox }) => {
      const updated = await assets.markReady(orgId, asset.id, patch);
      if (updated) {
        await outbox.append([assetEvents.assetReady.make({ orgId, data: updated })]);
      }
      return updated;
    });
    if (updated) {
      this.logger.info('asset confirmed', { orgId, assetId: asset.id });
    }
    return updated;
  }

  private async readyAmong(orgId: string, assetIds: readonly string[]): Promise<Asset[]> {
    const ids = [...new Set(assetIds)];
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.repo.findByIds(orgId, ids);
    return rows.filter((asset) => asset.orgId === orgId && asset.status === 'ready');
  }

  private async view(asset: Asset): Promise<AssetView> {
    const [view] = await this.views([asset]);
    return view!;
  }

  private async views(assets: readonly Asset[]): Promise<AssetView[]> {
    const served = assets.filter((asset) => asset.source === 'library' && asset.status === 'ready');
    const [urls, downloadUrls] = await Promise.all([
      this.signReady(served, () => undefined),
      this.signReady(served, (asset) => asset.filename),
    ]);
    return assets.map((asset) => ({
      ...asset,
      url: urls[asset.id] ?? null,
      downloadUrl: downloadUrls[asset.id] ?? null,
    }));
  }

  private async discard(orgId: string, asset: Asset): Promise<boolean> {
    const deleted = await this.uow.run(async ({ assets, outbox }) => {
      const deleted = await assets.delete(orgId, asset.id);
      if (deleted) {
        await outbox.append([assetEvents.assetDeleted.make({ orgId, data: asset })]);
      }
      return deleted;
    });
    if (deleted) {
      await this.removeObject(orgId, asset.id, asset.key);
      await this.removePublicCopies(orgId, asset.id);
    }
    return deleted;
  }

  private async removePublicCopies(orgId: string, assetId: string): Promise<void> {
    try {
      const copies = await this.storage.list(`${PUBLIC_PREFIX}${orgId}/`);
      for (const copy of copies.filter((o) => o.key.endsWith(`/${assetId}`))) {
        await this.removeObject(orgId, assetId, copy.key);
      }
    } catch (err) {
      this.logger.warn('public copies not removed', { orgId, assetId, err });
    }
  }

  private async removeObject(orgId: string, assetId: string, key: string): Promise<void> {
    try {
      await this.storage.remove(key);
    } catch (error) {
      this.logger.warn('stored object not removed', { orgId, assetId, err: error });
    }
  }
}

function sizeLabel(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${units[unit]}`;
}
