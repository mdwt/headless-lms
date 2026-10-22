import { genId } from '../shared/id.js';
import type { Logger, ObjectStorage } from '../shared/ports.js';
import { ConflictError } from '../shared/errors.js';
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
    this.storage = params.storage;
    this.repo = params.repo;
    this.uow = params.uow;
    this.memberImageMaxBytes = params.memberImageMaxBytes;
    this.logger = params.logger ?? noopLogger;
  }

  async requestUpload(orgId: string, input: RequestUploadInput): Promise<UploadTicket> {
    const id = genId('asset');
    const kind = kindOf(input.contentType);
    const key = `${orgPrefix(orgId)}${kind}/${id}/${sanitizeFilename(input.filename)}`;
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
    const stat = await this.storage.stat(asset.key);
    if (!stat) {
      this.logger.debug('asset not yet uploaded', { orgId, assetId: id });
      return asset;
    }
    if (asset.source === 'member') {
      const contentType = stat.contentType ?? asset.contentType;
      const reason =
        kindOf(contentType) !== 'image'
          ? 'A member upload must be an image'
          : stat.size > this.memberImageMaxBytes
            ? 'This image is too large'
            : null;
      if (reason) {
        await this.discard(orgId, asset);
        this.logger.info('member upload refused', { orgId, assetId: id, reason });
        throw new ConflictError(reason);
      }
    }
    const updated = await this.uow.run(async ({ assets, outbox }) => {
      const updated = await assets.update(id, {
        size: stat.size,
        contentType: stat.contentType ?? asset.contentType,
        status: 'ready',
      });
      if (updated) {
        await outbox.append([assetEvents.assetReady.make({ orgId, data: updated })]);
      }
      return updated;
    });
    this.logger.info('asset confirmed', { orgId, assetId: id });
    return updated;
  }

  async confirmOwn(orgId: string, id: string, orgUserId: string): Promise<Asset | null> {
    const asset = await this.repo.findById(orgId, id);
    if (!asset || asset.source !== 'member' || asset.uploadedBy !== orgUserId) {
      this.logger.debug('upload confirm refused', { orgId, assetId: id, orgUserId });
      return null;
    }
    return this.confirm(orgId, id);
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
    const url = await this.storage.presignDownload({
      key: asset.key,
      downloadFilename: filename ?? asset.filename,
      ...(expiresInSeconds === undefined ? {} : { expiresInSeconds }),
    });
    return { url, asset };
  }

  async remove(orgId: string, id: string): Promise<boolean> {
    const asset = await this.repo.findById(orgId, id);
    if (!asset) {
      return false;
    }
    if (await this.repo.isReferenced(orgId, id)) {
      throw new ConflictError('This file is still in use');
    }
    await this.discard(orgId, asset);
    this.logger.info('asset removed', { orgId, assetId: id });
    return true;
  }

  async removeOwn(orgId: string, id: string, orgUserId: string): Promise<boolean> {
    const asset = await this.repo.findById(orgId, id);
    if (!asset || asset.source !== 'member' || asset.uploadedBy !== orgUserId) {
      return false;
    }
    return this.remove(orgId, id);
  }

  async removeUnattached(orgId: string, before: Date): Promise<number> {
    const stale = await this.repo.listUnreferencedMemberUploads(orgId, before);
    let removed = 0;
    for (const asset of stale) {
      if (await this.repo.isReferenced(orgId, asset.id)) {
        continue;
      }
      await this.discard(orgId, asset);
      removed += 1;
    }
    if (removed > 0) {
      this.logger.info('unattached uploads removed', { orgId, count: removed });
    }
    return removed;
  }

  private async discard(orgId: string, asset: Asset): Promise<void> {
    await this.storage.remove(asset.key);
    await this.uow.run(async ({ assets, outbox }) => {
      const deleted = await assets.delete(asset.id);
      if (deleted) {
        await outbox.append([assetEvents.assetDeleted.make({ orgId, data: asset })]);
      }
    });
  }
}
