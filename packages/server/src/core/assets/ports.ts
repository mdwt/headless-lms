// assets context — ports.
import type {
  Asset,
  AssetsQuery,
  DownloadTicket,
  Page,
  RequestUploadInput,
  UploadTicket,
} from './model.js';

export interface AssetsService {
  /** Register an asset and return a presigned URL to upload its bytes. */
  requestUpload(orgId: string, input: RequestUploadInput): Promise<UploadTicket>;
  /** After upload, capture size/content-type from storage and mark ready. */
  confirm(orgId: string, id: string): Promise<Asset | null>;
  list(orgId: string, query: AssetsQuery): Promise<Page<Asset>>;
  get(orgId: string, id: string): Promise<Asset | null>;
  /** Short-lived presigned URL to download/serve the asset. */
  requestDownload(orgId: string, id: string, filename?: string): Promise<DownloadTicket | null>;
  /** Remove the object from storage and the registry. */
  remove(orgId: string, id: string): Promise<boolean>;
}

export interface AssetsRepository {
  insert(orgId: string, asset: Asset): Promise<Asset>;
  list(orgId: string, query: AssetsQuery): Promise<Page<Asset>>;
  /** Scoped to the org — returns null if the asset belongs to another org. */
  findById(orgId: string, id: string): Promise<Asset | null>;
  update(
    id: string,
    patch: Partial<Pick<Asset, 'size' | 'contentType' | 'status'>>,
  ): Promise<Asset | null>;
  delete(id: string): Promise<boolean>;
}
