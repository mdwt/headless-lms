// assets context — service. Owns org-scoped key construction and the asset
// lifecycle (register → upload → confirm → serve → remove); delegates the
// actual object operations to the ObjectStorage port. Org isolation is enforced
// by scoping every lookup to the caller's org (cross-org reads return null).
import { genId } from '../shared/id.js';
import type { Logger, ObjectStorage } from '../shared/ports.js';
import type {
  Asset,
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
  ImageUploadInput,
} from './ports.js';
import { noopLogger } from '../shared/logger.js';
import { assetEvents } from './events.js';

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
  logger?: Logger;
};

export class AssetsServiceImpl implements AssetsService {
  private readonly storage: ObjectStorage;
  private readonly repo: AssetsRepository;
  private readonly uow: AssetsUnitOfWork;
  private readonly logger: Logger;

  constructor(params: AssetsServiceParams) {
    this.storage = params.storage;
    this.repo = params.repo;
    this.uow = params.uow;
    this.logger = params.logger ?? noopLogger;
  }

  async requestUpload(orgId: string, input: RequestUploadInput): Promise<UploadTicket> {
    const id = genId('asset');
    const key = `${orgPrefix(orgId)}${input.kind}/${id}/${sanitizeFilename(input.filename)}`;
    const presigned = await this.storage.presignUpload({ key, contentType: input.contentType });
    const now = new Date();
    const asset = await this.uow.run(async ({ assets, outbox }) => {
      const asset = await assets.insert(orgId, {
        orgId,
        id,
        key,
        kind: input.kind,
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
    this.logger.info('asset upload requested', { orgId, assetId: id, kind: input.kind });
    return {
      asset,
      uploadUrl: presigned.url,
      method: 'PUT',
      expiresInSeconds: presigned.expiresInSeconds,
      headers: presigned.headers,
    };
  }

  async requestImageUpload(
    orgId: string,
    orgUserId: string,
    input: ImageUploadInput,
  ): Promise<UploadTicket> {
    const ticket = await this.requestUpload(orgId, {
      filename: input.filename,
      contentType: input.contentType,
      kind: 'image',
      uploadedBy: orgUserId,
    });
    this.logger.debug('image upload requested', { orgId, orgUserId, assetId: ticket.asset.id });
    return ticket;
  }

  async confirm(orgId: string, id: string): Promise<Asset | null> {
    const asset = await this.repo.findById(orgId, id);
    if (!asset) {
      return null;
    }
    const stat = await this.storage.stat(asset.key);
    if (!stat) {
      this.logger.debug('asset not yet uploaded', { orgId, assetId: id });
      return asset; // not uploaded yet — stays pending
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

  async confirmOwnImage(orgId: string, id: string, orgUserId: string): Promise<Asset | null> {
    if (!(await this.ownsImage(orgId, id, orgUserId))) {
      this.logger.debug('image confirm refused', { orgId, assetId: id, orgUserId });
      return null;
    }
    return this.confirm(orgId, id);
  }

  async ownsImage(orgId: string, assetId: string, orgUserId: string): Promise<boolean> {
    const asset = await this.repo.findById(orgId, assetId);
    return asset !== null && asset.kind === 'image' && asset.uploadedBy === orgUserId;
  }

  list(orgId: string, query: AssetsQuery): Promise<Page<Asset>> {
    return this.repo.list(orgId, query);
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
    await this.storage.remove(asset.key);
    const deleted = await this.uow.run(async ({ assets, outbox }) => {
      const deleted = await assets.delete(id);
      if (deleted) {
        await outbox.append([assetEvents.assetDeleted.make({ orgId, data: asset })]);
      }
      return deleted;
    });
    this.logger.info('asset removed', { orgId, assetId: id });
    return deleted;
  }
}
