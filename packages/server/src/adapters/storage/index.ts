// Default when no ObjectStorage is injected — boots, fails loudly on use.
import type {
  Logger,
  ObjectStorage,
  PresignDownloadInput,
  PresignedUpload,
  StoredObjectInfo,
} from '../../core/shared/ports.js';
import { noopLogger } from '../../core/shared/logger.js';

export class StorageAdapter implements ObjectStorage {
  constructor(private readonly logger: Logger = noopLogger) {}

  async presignUpload(_input: {
    key: string;
    contentType?: string;
    expiresInSeconds?: number;
  }): Promise<PresignedUpload> {
    return this.fail('presignUpload');
  }

  async presignDownload(_input: PresignDownloadInput): Promise<string> {
    return this.fail('presignDownload');
  }

  async stat(_key: string): Promise<StoredObjectInfo | null> {
    return this.fail('stat');
  }

  async remove(_key: string): Promise<void> {
    return this.fail('remove');
  }

  private fail(op: string): never {
    this.logger.error(`storage ${op} failed: no storage adapter configured`);
    throw new Error('not implemented');
  }
}
