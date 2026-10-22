import { genId, ksuid } from '../shared/id.js';
import type { Logger, ObjectStorage, StoredObjectInfo } from '../shared/ports.js';
import { ConflictError, ForbiddenError } from '../shared/errors.js';
import type {
  Asset,
  AssetKind,
  AssetsQuery,
  DownloadTicket,
  Page,
  RequestUploadInput,
  UploadTicket,
} from './model.js';
import type {
  AssetsRepository,
  AssetsService,
  AssetsUnitOfWork,
  MemberUploadInput,
} from './ports.js';
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
  return `${orgPrefix(orgId)}image/${asset.id}/${ksuid()}/${sanitizeFilename(asset.filename)}`;
}

function graceCutoff(now: Date): Date {
  return new Date(now.getTime() - UNATTACHED_UPLOAD_GRACE_MS);
}

export type AssetsServiceParams = {
  storage: ObjectStorage;
  repo: AssetsRepository;
  uow: AssetsUnitOfWork;
  memberImageMaxBytes: number;
  logger?: Logger;
};

export class AssetsServiceImpl implements AssetsService {
  private readonly storage: ObjectStorage;
  private readonly repo: AssetsRepository;
  private readonly uow: AssetsUnitOfWork;
  private readonly memberImageMaxBytes: number;
  private readonly logger: Logger;

  constructor(params: AssetsServiceParams) {
    if (!Number.isSafeInteger(params.memberImageMaxBytes) || params.memberImageMaxBytes <= 0) {
      throw new Error(
        `invalid memberImageMaxBytes "${params.memberImageMaxBytes}" (expected a positive integer)`,
      );
    }
    this.storage = params.storage;
    this.repo = params.repo;
    this.uow = params.uow;
    this.memberImageMaxBytes = params.memberImageMaxBytes;
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
      asset,
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
      throw new ConflictError('A member upload must be an image');
    }
    return this.requestUpload(orgId, {
      filename: input.filename,
      contentType: input.contentType,
      source: 'member',
      uploadedBy: orgUserId,
    });
  }

  async confirm(orgId: string, id: string): Promise<Asset | null> {
    const asset = await this.repo.findById(orgId, id);
    if (!asset) {
      return null;
    }
    if (asset.source === 'member') {
      throw new ForbiddenError('Only the uploader can finalize a member upload');
    }
    return this.finalize(orgId, asset);
  }

  async confirmOwn(orgId: string, id: string, orgUserId: string): Promise<Asset | null> {
    const asset = await this.repo.findById(orgId, id);
    if (!asset || asset.source !== 'member' || asset.uploadedBy !== orgUserId) {
      this.logger.debug('upload confirm refused', { orgId, assetId: id, orgUserId });
      return null;
    }
    return this.finalize(orgId, asset);
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

  list(orgId: string, query: AssetsQuery): Promise<Page<Asset>> {
    return this.repo.list(orgId, { ...query, source: query.source ?? 'library' });
  }

  get(orgId: string, id: string): Promise<Asset | null> {
    return this.repo.findById(orgId, id);
  }

  async requestDownload(
    orgId: string,
    id: string,
    filename?: string,
    expiresInSeconds?: number,
  ): Promise<DownloadTicket | null> {
    const asset = await this.repo.findById(orgId, id);
    if (!asset) {
      return null;
    }
    return this.sign(asset, filename, expiresInSeconds);
  }

  async requestLibraryDownload(
    orgId: string,
    id: string,
    filename?: string,
  ): Promise<DownloadTicket | null> {
    const asset = await this.repo.findById(orgId, id);
    if (!asset) {
      return null;
    }
    if (asset.source === 'member') {
      throw new ForbiddenError('A member upload is served through what it is attached to');
    }
    return this.sign(asset, filename);
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
    for (const asset of stale) {
      try {
        if (await this.discard(orgId, asset)) {
          removed += 1;
        }
      } catch (error) {
        if (!(error instanceof ConflictError)) {
          throw error;
        }
      }
    }
    let stray = 0;
    for (const key of await this.strayUploads(orgId, now)) {
      try {
        await this.storage.remove(key);
        stray += 1;
      } catch (error) {
        this.logger.warn('stray upload not removed', { orgId, error: (error as Error).message });
      }
    }
    if (removed > 0 || stray > 0) {
      this.logger.info('unattached uploads removed', { orgId, count: removed, stray });
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
    const key = finalMemberKey(orgId, asset);
    try {
      await this.storage.copy({ from: asset.key, to: key });
    } catch (error) {
      return this.afterFailedCopy(orgId, asset, error);
    }
    let ready: Asset | null;
    try {
      const stat = await this.storage.stat(key);
      if (!stat) {
        throw new Error('copied upload not found');
      }
      ready = await this.acceptMemberUpload(orgId, asset, key, stat);
    } catch (error) {
      await this.releaseFinalKey(orgId, asset.id, key);
      throw error;
    }
    if (!ready) {
      await this.removeObject(orgId, asset.id, key);
      return this.repo.findById(orgId, asset.id);
    }
    await this.removeObject(orgId, asset.id, asset.key);
    return ready;
  }

  private async acceptMemberUpload(
    orgId: string,
    asset: Asset,
    key: string,
    stat: StoredObjectInfo,
  ): Promise<Asset | null> {
    const contentType = stat.contentType ?? asset.contentType;
    const kind = kindOf(contentType);
    const reason =
      kind !== 'image'
        ? 'A member upload must be an image'
        : stat.size > this.memberImageMaxBytes
          ? 'This image is too large'
          : null;
    if (reason) {
      await this.discard(orgId, asset);
      this.logger.info('member upload refused', { orgId, assetId: asset.id, reason });
      throw new ConflictError(reason);
    }
    return this.markReady(orgId, asset, { key, kind, size: stat.size, contentType });
  }

  private async afterFailedCopy(
    orgId: string,
    asset: Asset,
    error: unknown,
  ): Promise<Asset | null> {
    const current = await this.repo.findById(orgId, asset.id);
    if (!current || current.status === 'ready') {
      return current;
    }
    if (!(await this.storage.stat(asset.key))) {
      this.logger.debug('asset not yet uploaded', { orgId, assetId: asset.id });
      return current;
    }
    throw error;
  }

  private async releaseFinalKey(orgId: string, assetId: string, key: string): Promise<void> {
    let current: Asset | null;
    try {
      current = await this.repo.findById(orgId, assetId);
    } catch (error) {
      this.logger.warn('finalized object kept', {
        orgId,
        assetId,
        error: (error as Error).message,
      });
      return;
    }
    if (current?.key !== key) {
      await this.removeObject(orgId, assetId, key);
    }
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

  private async sign(
    asset: Asset,
    filename?: string,
    expiresInSeconds?: number,
  ): Promise<DownloadTicket> {
    const url = await this.storage.presignDownload({
      key: asset.key,
      downloadFilename: filename ?? asset.filename,
      ...(expiresInSeconds === undefined ? {} : { expiresInSeconds }),
    });
    return { url, asset };
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
      this.logger.warn('stored object not removed', {
        orgId,
        assetId,
        error: (error as Error).message,
      });
    }
  }
}
