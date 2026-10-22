import type {
  Asset,
  AssetsQuery,
  DownloadTicket,
  Page,
  RequestUploadInput,
  UploadTicket,
} from './model.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';

export interface MemberImageReader {
  ownsImage(orgId: string, assetId: string, orgUserId: string): Promise<boolean>;
}

export interface MemberUploadInput {
  filename: string;
  contentType: string;
}

export interface AssetsService extends MemberImageReader {
  requestUpload(orgId: string, input: RequestUploadInput): Promise<UploadTicket>;
  requestMemberUpload(
    orgId: string,
    orgUserId: string,
    input: MemberUploadInput,
  ): Promise<UploadTicket>;
  confirm(orgId: string, id: string): Promise<Asset | null>;
  confirmOwn(orgId: string, id: string, orgUserId: string): Promise<Asset | null>;
  list(orgId: string, query: AssetsQuery): Promise<Page<Asset>>;
  get(orgId: string, id: string): Promise<Asset | null>;
  requestDownload(
    orgId: string,
    id: string,
    filename?: string,
    expiresInSeconds?: number,
  ): Promise<DownloadTicket | null>;
  remove(orgId: string, id: string): Promise<boolean>;
  removeOwn(orgId: string, id: string, orgUserId: string): Promise<boolean>;
  removeUnattached(orgId: string, before: Date): Promise<number>;
}

export interface AssetsRepository {
  insert(orgId: string, asset: Asset): Promise<Asset>;
  list(orgId: string, query: AssetsQuery): Promise<Page<Asset>>;
  findById(orgId: string, id: string): Promise<Asset | null>;
  update(
    id: string,
    patch: Partial<Pick<Asset, 'size' | 'contentType' | 'status'>>,
  ): Promise<Asset | null>;
  delete(id: string): Promise<boolean>;
  isReferenced(orgId: string, id: string): Promise<boolean>;
  listUnreferencedMemberUploads(orgId: string, before: Date): Promise<Asset[]>;
}

export interface AssetsWriteScope {
  assets: AssetsRepository;
  outbox: OutboxAppender;
}

export type AssetsUnitOfWork = UnitOfWork<AssetsWriteScope>;
