import { genId } from '../shared/id.js';
import type { Logger, ObjectStorage } from '../shared/ports.js';
import { ConflictError, ForbiddenError, InvalidInputError } from '../shared/errors.js';
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
  MemberUploadInput,
  ReadyFile,
} from './ports.js';
import type { FileUrls } from './file-urls.js';
import { noopLogger } from '../shared/logger.js';
import { assetEvents } from './events.js';

const UNATTACHED_UPLOAD_GRACE_MS = 60 * 60 * 1000;

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
  return `${orgPrefix(orgId)}image/${asset.id}/${sanitizeFilename(asset.filename)}`;
}

function graceCutoff(now: Date): Date {
  return new Date(now.getTime() - UNATTACHED_UPLOAD_GRACE_MS);
}

export type AssetsServiceParams = {
  storage: ObjectStorage;
  repo: AssetsRepository;
  uow: AssetsUnitOfWork;
  memberImageMaxBytes: number;
  downloadLinkExpirySeconds: number;
  fileUrls: FileUrls;
  logger?: Logger;
};

export class AssetsServiceImpl implements AssetsService {
  private readonly storage: ObjectStorage;
  private readonly repo: AssetsRepository;
  private readonly uow: AssetsUnitOfWork;
  private readonly memberImageMaxBytes: number;
  private readonly downloadLinkExpirySeconds: number;
  private readonly fileUrls: FileUrls;
  private readonly logger: Logger;

  constructor(params: AssetsServiceParams) {
    if (!Number.isSafeInteger(params.memberImageMaxBytes) || params.memberImageMaxBytes <= 0) {
      throw new Error(
        `invalid memberImageMaxBytes "${params.memberImageMaxBytes}" (expected a positive integer)`,
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
    this.downloadLinkExpirySeconds = params.downloadLinkExpirySeconds;
    this.fileUrls = params.fileUrls;
    this.logger = params.logger ?? noopLogger;
  }

  async requestUpload(orgId: string, input: RequestUploadInput): Promise<UploadTicket> {
    const id = genId('asset');
    const kind = kindOf(input.contentType);
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
    });
    return {
      asset: { ...asset, url: null, downloadUrl: null },
      uploadUrl: presigned.url,
      method: 'PUT',
      expiresInSeconds: presigned.expiresInSeconds,
      headers: presigned.headers,
    };
  }

  async requestMemberUpload(
    orgId: string,
    orgUserId: string,
    input: MemberUploadInput,
  ): Promise<UploadTicket> {
    if (kindOf(input.contentType) !== 'image') {
      throw new InvalidInputError('A member upload must be an image');
    }
    return this.requestUpload(orgId, {
      filename: input.filename,
      contentType: input.contentType,
      source: 'member',
      uploadedBy: orgUserId,
    });
  }

  async confirm(orgId: string, id: string): Promise<AssetView | null> {
    const asset = await this.repo.findById(orgId, id);
    if (!asset) {
      return null;
    }
    if (asset.source === 'member') {
      throw new ForbiddenError('Only the uploader can finalize a member upload');
    }
    const confirmed = await this.finalize(orgId, asset);
    return confirmed ? this.view(confirmed) : null;
  }

  async confirmOwn(orgId: string, id: string, orgUserId: string): Promise<AssetView | null> {
    const asset = await this.repo.findById(orgId, id);
    if (!asset || asset.source !== 'member' || asset.uploadedBy !== orgUserId) {
      this.logger.debug('upload confirm refused', { orgId, assetId: id, orgUserId });
      return null;
    }
    const confirmed = await this.finalize(orgId, asset);
    if (!confirmed) {
      return null;
    }
    return confirmed.status === 'ready'
      ? { ...confirmed, url: this.fileUrls.memberUpload(confirmed.id), downloadUrl: null }
      : { ...confirmed, url: null, downloadUrl: null };
  }

  async ownUploadFile(orgId: string, assetId: string, orgUserId: string): Promise<string | null> {
    if (!(await this.ownsImage(orgId, assetId, orgUserId))) {
      this.logger.warn('upload file not served — not the uploader', { orgId, assetId, orgUserId });
      return null;
    }
    return this.signFile(orgId, assetId);
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

  async libraryAssetsAmong(orgId: string, assetIds: string[]): Promise<string[]> {
    if (assetIds.length === 0) {
      return [];
    }
    const rows = await this.repo.findByIds(orgId, [...new Set(assetIds)]);
    const library = new Set(
      rows.filter((a) => a.source === 'library' && a.status === 'ready').map((a) => a.id),
    );
    return assetIds.filter((id) => library.has(id));
  }

  async list(orgId: string, query: AssetsQuery): Promise<Page<AssetView>> {
    const page = await this.repo.list(orgId, { ...query, source: query.source ?? 'library' });
    return { ...page, rows: await Promise.all(page.rows.map((asset) => this.view(asset))) };
  }

  async get(orgId: string, id: string): Promise<AssetView | null> {
    const asset = await this.repo.findById(orgId, id);
    return asset ? this.view(asset) : null;
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

  async signFile(
    orgId: string,
    assetId: string,
    opts: { saveAs?: string } = {},
  ): Promise<string | null> {
    const [asset] = await this.readyAmong(orgId, [assetId]);
    if (!asset) {
      this.logger.warn('file not served — no ready asset', { orgId, assetId });
      return null;
    }
    return opts.saveAs === undefined
      ? this.storage.presignDownload({ key: asset.key })
      : this.storage.presignDownload({
          key: asset.key,
          downloadFilename: opts.saveAs,
          expiresInSeconds: this.downloadLinkExpirySeconds,
        });
  }

  async libraryFile(
    orgId: string,
    assetId: string,
    opts: { download: boolean },
  ): Promise<string | null> {
    const asset = await this.repo.findById(orgId, assetId);
    if (!asset || asset.source !== 'library') {
      this.logger.warn('library file not served — not a library asset', { orgId, assetId });
      return null;
    }
    return this.signFile(orgId, assetId, opts.download ? { saveAs: asset.filename } : {});
  }

  async remove(orgId: string, id: string): Promise<boolean> {
    const asset = await this.repo.findById(orgId, id);
    if (!asset) {
      return false;
    }
    const removed = await this.discard(orgId, asset);
    if (removed) {
      this.logger.info('asset removed', { orgId, assetId: id });
    }
    return removed;
  }

  async removeOwn(orgId: string, id: string, orgUserId: string): Promise<boolean> {
    const asset = await this.repo.findById(orgId, id);
    if (!asset || asset.source !== 'member' || asset.uploadedBy !== orgUserId) {
      return false;
    }
    return this.remove(orgId, id);
  }

  async hasUnattached(orgId: string, now: Date): Promise<boolean> {
    if (await this.repo.hasUnreferencedMemberUploads(orgId, graceCutoff(now))) {
      return true;
    }
    return (await this.strayUploads(orgId, now)).length > 0;
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
    if (removed > 0 || stray > 0 || failed > 0) {
      this.logger.info('unattached uploads removed', { orgId, count: removed, stray, failed });
    }
    return removed + stray;
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
    const kind = kindOf(contentType);
    const reason =
      kind !== 'image'
        ? 'A member upload must be an image'
        : stat.contentType !== undefined && stat.contentType !== contentType
          ? 'The uploaded file is not the declared type'
          : stat.size > this.memberImageMaxBytes
            ? 'This image is too large'
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

  private view(asset: Asset): AssetView {
    if (asset.source !== 'library' || asset.status !== 'ready') {
      return { ...asset, url: null, downloadUrl: null };
    }
    return {
      ...asset,
      url: this.fileUrls.libraryFile(asset.id),
      downloadUrl: this.fileUrls.libraryDownload(asset.id),
    };
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
    }
    return deleted;
  }

  private async removeObject(orgId: string, assetId: string, key: string): Promise<void> {
    try {
      await this.storage.remove(key);
    } catch (error) {
      this.logger.warn('stored object not removed', { orgId, assetId, err: error });
    }
  }
}
