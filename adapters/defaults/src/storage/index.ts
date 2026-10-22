// Default when no ObjectStorage is injected — boots, fails loudly on use.
import type {
  Logger,
  ObjectStorage,
  PresignDownloadInput,
  PresignedUpload,
  StoredObjectInfo,
} from "@headless-lms/core/shared/ports";
import { noopLogger } from "@headless-lms/core/shared/logger";

export class StorageAdapter implements ObjectStorage {
  readonly uploadExpirySeconds = 0;

  constructor(private readonly logger: Logger = noopLogger) {}

  async presignUpload(_input: {
    key: string;
    contentType?: string;
    expiresInSeconds?: number;
  }): Promise<PresignedUpload> {
    return this.fail("presignUpload");
  }

  async presignDownload(_input: PresignDownloadInput): Promise<string> {
    return this.fail("presignDownload");
  }

  async stat(_key: string): Promise<StoredObjectInfo | null> {
    return this.fail("stat");
  }

  async list(_prefix: string): Promise<StoredObjectInfo[]> {
    return [];
  }

  async copy(_input: { from: string; to: string }): Promise<void> {
    return this.fail("copy");
  }

  async remove(_key: string): Promise<void> {
    return this.fail("remove");
  }

  private fail(op: string): never {
    this.logger.error(`storage ${op} failed: no storage adapter configured`);
    throw new Error("not implemented");
  }
}
