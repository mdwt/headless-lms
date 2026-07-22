// credentials — Drizzle-backed secure credential store (implements the shared
// core port). Secrets are JSON documents: serialized here, encrypted with
// AES-256-GCM via node:crypto (single 32-byte key from the environment), and
// parsed back to objects on reveal — callers never (de)serialize. The AAD
// binds each ciphertext to its (org, id) row, so moving a ciphertext to
// another row or org makes it undecryptable. Plaintext exists only inside
// store/reveal — it is never logged, listed, or returned elsewhere.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '../index.js';
import type { CredentialStore, Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';
import { genId } from '../../../core/shared/id.js';
import { credentials } from '../schema/credentials.js';

const IV_BYTES = 12;
const TAG_BYTES = 16;
/** Version of the key currently used for new writes (stored per row for rotation). */
const KEY_VERSION = 1;

function aad(orgId: string, id: string): Buffer {
  return Buffer.from(`${orgId}:${id}`, 'utf8');
}

/** base64(iv ‖ auth tag ‖ ciphertext) */
export function encryptSecret(key: Buffer, plaintext: string, aadValue: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aadValue);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

/** Throws if the payload was tampered with or the AAD/key doesn't match. */
export function decryptSecret(key: Buffer, payload: string, aadValue: Buffer): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const data = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(aadValue);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export class DrizzleCredentialStore implements CredentialStore {
  private key: Buffer | undefined;

  constructor(
    private readonly db: DbExecutor,
    /** base64-encoded 32-byte key (CREDENTIAL_STORE_KEY). Validated on first use, not at boot. */
    private readonly keyBase64: string,
    private readonly logger: Logger = noopLogger,
  ) {}

  private getKey(): Buffer {
    if (!this.key) {
      const key = Buffer.from(this.keyBase64, 'base64');
      if (key.length !== 32) {
        throw new Error(
          'CREDENTIAL_STORE_KEY must be a base64-encoded 32-byte key (generate with: openssl rand -base64 32)',
        );
      }
      this.key = key;
    }
    return this.key;
  }

  async store(orgId: string, secrets: Record<string, unknown>): Promise<string> {
    const id = genId('credential');
    const ciphertext = encryptSecret(this.getKey(), JSON.stringify(secrets), aad(orgId, id));
    await this.db.insert(credentials).values({ orgId, id, ciphertext, keyVersion: KEY_VERSION });
    return id;
  }

  async reveal(orgId: string, ref: string): Promise<Record<string, unknown> | null> {
    const [row] = await this.db
      .select()
      .from(credentials)
      .where(and(eq(credentials.orgId, orgId), eq(credentials.id, ref)))
      .limit(1);
    if (!row) {
      return null;
    }
    const plaintext = decryptSecret(this.getKey(), row.ciphertext, aad(orgId, ref));
    return JSON.parse(plaintext) as Record<string, unknown>;
  }

  async update(orgId: string, ref: string, secrets: Record<string, unknown>): Promise<void> {
    const ciphertext = encryptSecret(this.getKey(), JSON.stringify(secrets), aad(orgId, ref));
    await this.db
      .update(credentials)
      .set({ ciphertext, keyVersion: KEY_VERSION, updatedAt: new Date() })
      .where(and(eq(credentials.orgId, orgId), eq(credentials.id, ref)));
  }

  async destroy(orgId: string, ref: string): Promise<void> {
    await this.db
      .delete(credentials)
      .where(and(eq(credentials.orgId, orgId), eq(credentials.id, ref)));
  }
}
