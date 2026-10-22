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

export interface LibraryAssetReader {
  libraryAssetsAmong(orgId: string, assetIds: string[]): Promise<string[]>;
}

export interface MemberUploadInput {
  filename: string;
  contentType: string;
}

export interface AssetsService extends MemberImageReader, LibraryAssetReader {
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
  requestLibraryDownload(
    orgId: string,
    id: string,
    filename?: string,
  ): Promise<DownloadTicket | null>;
  remove(orgId: string, id: string): Promise<boolean>;
  removeOwn(orgId: string, id: string, orgUserId: string): Promise<boolean>;
  hasUnattached(orgId: string, now: Date): Promise<boolean>;
  removeUnattached(orgId: string, now: Date): Promise<number>;
}

export interface AssetsRepository {
  insert(orgId: string, asset: Asset): Promise<Asset>;
  list(orgId: string, query: AssetsQuery): Promise<Page<Asset>>;
  findById(orgId: string, id: string): Promise<Asset | null>;
  findByIds(orgId: string, ids: string[]): Promise<Asset[]>;
  markReady(
    orgId: string,
    id: string,
    patch: Pick<Asset, 'key' | 'kind' | 'size' | 'contentType'>,
  ): Promise<Asset | null>;
  delete(orgId: string, id: string): Promise<boolean>;
  hasUnreferencedMemberUploads(orgId: string, before: Date): Promise<boolean>;
  listUnreferencedMemberUploads(orgId: string, before: Date): Promise<Asset[]>;
  heldKeys(orgId: string, keys: string[]): Promise<string[]>;
}

export interface AssetsWriteScope {
  assets: AssetsRepository;
  outbox: OutboxAppender;
}

export type AssetsUnitOfWork = UnitOfWork<AssetsWriteScope>;
