// assets context — service. Owns org-scoped key construction and the asset
// lifecycle (register → upload → confirm → serve → remove); delegates the
// actual object operations to the ObjectStorage port. Org isolation is enforced
// by scoping every lookup to the caller's org (cross-org reads return null).
import { genId } from "../shared/id.js";
import type { ObjectStorage } from "../shared/ports.js";
import type {
  Asset,
  AssetsQuery,
  DownloadTicket,
  Page,
  RequestUploadInput,
  UploadTicket,
} from "./model.js";
import type { AssetsRepository, AssetsService } from "./ports.js";

function orgPrefix(orgId: string): string {
  return `org/${orgId}/`;
}

function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
}

export class AssetsServiceImpl implements AssetsService {
  constructor(
    private readonly storage: ObjectStorage,
    private readonly repo: AssetsRepository,
    private readonly now: () => string,
  ) {}

  async requestUpload(orgId: string, input: RequestUploadInput): Promise<UploadTicket> {
    const id = genId("asset");
    const key = `${orgPrefix(orgId)}${input.kind}/${id}/${sanitizeFilename(input.filename)}`;
    const presigned = await this.storage.presignUpload({ key, contentType: input.contentType });
    const asset = await this.repo.insert(orgId, {
      id,
      key,
      kind: input.kind,
      filename: input.filename,
      contentType: input.contentType,
      size: 0,
      status: "pending",
      uploadedBy: input.uploadedBy,
      createdAt: this.now(),
    });
    return {
      asset,
      uploadUrl: presigned.url,
      method: "PUT",
      expiresInSeconds: presigned.expiresInSeconds,
      headers: presigned.headers,
    };
  }

  async confirm(orgId: string, id: string): Promise<Asset | null> {
    const asset = await this.repo.findById(orgId, id);
    if (!asset) return null;
    const stat = await this.storage.stat(asset.key);
    if (!stat) return asset; // not uploaded yet — stays pending
    return this.repo.update(id, {
      size: stat.size,
      contentType: stat.contentType ?? asset.contentType,
      status: "ready",
    });
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
  ): Promise<DownloadTicket | null> {
    const asset = await this.repo.findById(orgId, id);
    if (!asset) return null;
    const url = await this.storage.presignDownload({
      key: asset.key,
      downloadFilename: filename ?? asset.filename,
    });
    return { url, asset };
  }

  /**
   * Presigned URL for inline display (no attachment disposition). Backs the
   * stable `/api/assets/:id/file` redirect that editor content embeds —
   * content stores the stable route, never the expiring presigned URL.
   */
  async serveUrl(orgId: string, id: string): Promise<string | null> {
    const asset = await this.repo.findById(orgId, id);
    if (!asset) return null;
    return this.storage.presignDownload({ key: asset.key });
  }

  async remove(orgId: string, id: string): Promise<boolean> {
    const asset = await this.repo.findById(orgId, id);
    if (!asset) return false;
    await this.storage.remove(asset.key);
    return this.repo.delete(id);
  }
}
