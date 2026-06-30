// assets context — the org's media library. An Asset is a tracked object in
// storage (video, downloadable file, or inline content) that domain objects
// (e.g. a lesson) reference by id. Framework-free.

export type AssetKind = "video" | "download" | "content";
export type AssetStatus = "pending" | "ready";

export interface Asset {
  readonly id: string;
  /** Object key in the storage bucket. */
  key: string;
  kind: AssetKind;
  filename: string;
  contentType: string;
  /** Bytes; 0 until the upload is confirmed. */
  size: number;
  status: AssetStatus;
  /** Auth user id of the uploader. */
  uploadedBy: string;
  createdAt: string;
}

export interface RequestUploadInput {
  uploadedBy: string;
  filename: string;
  contentType: string;
  kind: AssetKind;
}

export interface UploadTicket {
  asset: Asset;
  uploadUrl: string;
  method: "PUT";
  expiresInSeconds: number;
  headers: Record<string, string>;
}

export interface DownloadTicket {
  url: string;
  asset: Asset;
}

export interface AssetsQuery {
  page: number;
  pageSize: number;
  search?: string | undefined;
  sort?: string | undefined;
  kind?: AssetKind | undefined;
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
