import type {
  Asset,
  AssetView,
  AssetsQuery,
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

export interface ReadyFile {
  filename: string;
  contentType: string;
  size: number;
}

export interface AssetFiles {
  /** Ready files of the org among these ids, with what a download shows of them. */
  readyFiles(orgId: string, assetIds: readonly string[]): Promise<Record<string, ReadyFile>>;
  /** A signed storage URL for a ready file of the org, after the caller has checked
   *  access. `saveAs` makes it a short-lived download under that name. */
  signFile(orgId: string, assetId: string, opts?: { saveAs?: string }): Promise<string | null>;
}

export interface MemberUploadInput {
  filename: string;
  contentType: string;
}

export interface AssetsService extends MemberImageReader, LibraryAssetReader, AssetFiles {
  requestUpload(orgId: string, input: RequestUploadInput): Promise<UploadTicket>;
  requestMemberUpload(
    orgId: string,
    orgUserId: string,
    input: MemberUploadInput,
  ): Promise<UploadTicket>;
  confirm(orgId: string, id: string): Promise<AssetView | null>;
  confirmOwn(orgId: string, id: string, orgUserId: string): Promise<AssetView | null>;
  list(orgId: string, query: AssetsQuery): Promise<Page<AssetView>>;
  get(orgId: string, id: string): Promise<AssetView | null>;
  libraryFile(orgId: string, assetId: string, opts: { download: boolean }): Promise<string | null>;
  ownUploadFile(orgId: string, assetId: string, orgUserId: string): Promise<string | null>;
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
