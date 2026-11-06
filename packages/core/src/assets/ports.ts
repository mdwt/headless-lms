import type {
  Asset,
  AssetView,
  AssetsQuery,
  Page,
  RequestUploadInput,
  UploadTicket,
} from './model.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';
import type { Actor } from '../shared/actor.js';
import type { AssetKind, ContentType } from '../types/index.js';

export interface MemberImageReader {
  ownsImage(orgId: string, assetId: string, orgUserId: string): Promise<boolean>;
}

export interface MemberUpload {
  id: string;
  kind: AssetKind;
  filename: string;
  contentType: string;
  size: number;
}

export interface MemberUploadReader {
  ownsUpload(orgId: string, assetId: string, orgUserId: string): Promise<boolean>;
  memberUploads(orgId: string, assetIds: string[]): Promise<MemberUpload[]>;
}

export interface LibraryAssetReader {
  libraryAssetsFor(
    orgId: string,
    assetIds: string[],
  ): Promise<{ id: string; contentId: string | null }[]>;
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

export interface AssetsService
  extends MemberImageReader, MemberUploadReader, LibraryAssetReader, AssetFiles {
  requestUpload(input: RequestUploadInput, actor: Actor): Promise<UploadTicket>;
  requestMemberUpload(input: MemberUploadInput, actor: Actor): Promise<UploadTicket>;
  confirm(id: string, actor: Actor): Promise<AssetView>;
  confirmOwn(id: string, actor: Actor): Promise<AssetView>;
  list(query: AssetsQuery, actor: Actor): Promise<Page<AssetView>>;
  get(id: string, actor: Actor): Promise<AssetView>;
  libraryFile(assetId: string, opts: { download: boolean }, actor: Actor): Promise<string>;
  ownUploadFile(assetId: string, actor: Actor): Promise<string>;
  remove(id: string, actor: Actor): Promise<void>;
  removeOwn(id: string, actor: Actor): Promise<void>;
  removeUnattached(orgId: string, now: Date): Promise<number>;
}

export interface OrgDirectory {
  orgIds(): Promise<string[]>;
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
  listUnreferencedMemberUploads(orgId: string, before: Date): Promise<Asset[]>;
  heldKeys(orgId: string, keys: string[]): Promise<string[]>;
  contentTypeOf(orgId: string, contentId: string): Promise<ContentType | null>;
}

export interface AssetsWriteScope {
  assets: AssetsRepository;
  outbox: OutboxAppender;
}

export type AssetsUnitOfWork = UnitOfWork<AssetsWriteScope>;
