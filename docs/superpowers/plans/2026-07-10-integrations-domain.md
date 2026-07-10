# Integrations Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement integrations management (spec: `docs/superpowers/specs/2026-07-09-integrations-design.md`): a seeded integration catalog, org-scoped connections, an encrypted shared secret store, the HTTP/contract/SDK surface, and an admin `/settings/integrations` page — seeded with Slack (a bot that posts to a channel).

**Architecture:** Hexagonal, matching the six existing contexts in `apps/api/src`. New core context `core/integrations/` (framework-free), a generic `SecretStore` port in `core/shared/ports.ts` implemented by `adapters/db/secrets.ts` (AES-256-GCM), three new tables (`integrations`, `connections`, `secrets`) added to the regenerated baseline migration, Zod contract + Fastify routes + generated SDK, and a server-loaded Next.js settings page in `apps/admin`.

**Tech Stack:** Node 22 ESM, strict TS, Fastify 5 + fastify-type-provider-zod, Drizzle/Postgres, zod 4, Next.js (admin), vitest.

## Global Constraints

- Work in the worktree at `/Users/mdwt/dev/headless-lms/headless-lms/.claude/worktrees/integrations-domain` (branch `worktree-integrations-domain`). All paths below are relative to it.
- `core/` may not import `adapters/`, `http/`, `composition/`, `reporting/`, `fastify`, `pg`, or `drizzle-orm` — ESLint enforces this; run `pnpm lint` after wiring changes.
- Org-scoped tables use the composite `(org_id, id)` PK pattern (see `apps/api/src/adapters/db/schema/entitlements.ts`).
- **No new migration files.** The project keeps a single `0000_baseline` migration; new tables are added by regenerating the baseline (Task 1) and resetting the dev database.
- Secrets are write-only over HTTP: no response schema ever includes secret values.
- Secrets are immutable in the store: rotation = put new → repoint reference → remove old. The `SecretStore` port has no `update`.
- Naming: `integration_id` / `integrationId` (never `integration_key`). Env var: `SECRETS_ENCRYPTION_KEY` (base64, 32 bytes decoded).
- ESM specifiers: intra-repo imports end in `.js` even from `.ts` files.
- Commit after every task. Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- `pnpm gen:sdk` and `pnpm --filter @headless-lms/api db:migrate` need the dev Postgres running and the root `.env` populated.

---

### Task 1: Schema — `secrets`, `integrations`, `connections` tables in the baseline

Two new schema files (the `secrets` table is a shared facility owned by the SecretStore adapter, so it gets its own file; `integrations` + `connections` belong to the integrations context), the id prefixes their `genId` defaults need, and a regenerated `0000_baseline` carrying the new tables plus the Slack catalog row.

**Files:**
- Create: `apps/api/src/adapters/db/schema/secrets.ts`
- Create: `apps/api/src/adapters/db/schema/integrations.ts`
- Modify: `apps/api/src/adapters/db/schema/index.ts` (add exports)
- Modify: `apps/api/src/core/shared/id.ts` (add `secret` + `connection` prefixes)
- Regenerated: `apps/api/drizzle/0000_baseline.sql`, `apps/api/drizzle/meta/` (then hand-append the Slack seed)

**Interfaces:**
- Produces (consumed by Tasks 2 and 4): Drizzle tables `secrets` (`orgId`, `id`, `ciphertext`, `iv`, `authTag`, `createdAt`), `integrations` (`id`, `name`, `description`, `enabled`), `connections` (`orgId`, `id`, `integrationId`, `config`, `secretId`, `status`, `createdAt`, `updatedAt`), exported from `schema/index.ts`.

- [ ] **Step 1: Add the id prefixes**

In `apps/api/src/core/shared/id.ts`, add to `ID_PREFIXES` (after `progress: "prg",`):

```ts
  connection: "con",
  secret: "sec",
```

- [ ] **Step 2: Create the secrets schema file**

Create `apps/api/src/adapters/db/schema/secrets.ts`:

```ts
// Encrypted secrets, org-scoped. Owned EXCLUSIVELY by the SecretStore adapter
// (adapters/db/secrets.ts) — AES-256-GCM columns, decrypted only there;
// nothing else reads or writes this table. Rows are immutable: rotation is
// insert-new + delete-old, never update.
import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { genId } from "../../../core/shared/id.js";
import { organizations } from "./organizations.js";

export const secrets = pgTable(
  "secrets",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("secret")),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
  }),
);
```

- [ ] **Step 3: Create the integrations schema file**

Create `apps/api/src/adapters/db/schema/integrations.ts`:

```ts
// integrations catalog + org connections.
// `integrations` is the global, seeded catalog (id is a slug like "slack") —
// rows are pre-built; adding one is a seed change, not runtime writes.
// `connections` is an org's link to one integration: non-secret config only;
// the credential lives in `secrets` behind `secret_id`.
import {
  boolean,
  foreignKey,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { genId } from "../../../core/shared/id.js";
import { organizations } from "./organizations.js";
import { secrets } from "./secrets.js";

export const integrations = pgTable("integrations", {
  id: text("id").primaryKey(), // catalog slug, e.g. "slack"
  name: text("name").notNull(),
  description: text("description").notNull(),
  enabled: boolean("enabled").notNull().default(true),
});

export const connections = pgTable(
  "connections",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("connection")),
    integrationId: text("integration_id")
      .notNull()
      .references(() => integrations.id),
    config: jsonb("config").notNull().$type<Record<string, unknown>>(),
    secretId: text("secret_id").notNull(),
    status: text("status", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    secretFk: foreignKey({
      columns: [t.orgId, t.secretId],
      foreignColumns: [secrets.orgId, secrets.id],
    }),
    // One connection per (org, integration).
    integrationUq: unique().on(t.orgId, t.integrationId),
  }),
);
```

In `apps/api/src/adapters/db/schema/index.ts`, add after `export * from "./assets.js";`:

```ts
export * from "./secrets.js";
export * from "./integrations.js";
```

- [ ] **Step 4: Regenerate the baseline (no new migration files)**

```bash
rm apps/api/drizzle/0000_baseline.sql
rm -rf apps/api/drizzle/meta
pnpm --filter @headless-lms/api db:generate -- --name=baseline
```

Expected: a fresh `apps/api/drizzle/0000_baseline.sql` containing ALL tables (the existing ones plus `integrations`, `secrets`, `connections`) and a fresh `meta/` (`_journal.json` with the single `0000_baseline` entry).

- [ ] **Step 5: Append the Slack catalog row to the baseline**

At the end of `apps/api/drizzle/0000_baseline.sql`, append:

```sql
--> statement-breakpoint
INSERT INTO "integrations" ("id", "name", "description", "enabled")
VALUES ('slack', 'Slack', 'Post messages to a Slack channel with a bot.', true);
```

- [ ] **Step 6: Reset the dev database and re-migrate (dev Postgres must be running)**

The baseline changed, so the dev DB must be rebuilt from it:

```bash
export $(grep -m1 '^DATABASE_URL' .env | tr -d '"')
psql "$DATABASE_URL" -c 'drop schema public cascade; create schema public;'
pnpm --filter @headless-lms/api db:migrate
pnpm --filter @headless-lms/api seed
```

Expected: migrate exits 0; `psql "$DATABASE_URL" -c "select id, name from integrations"` shows the `slack` row; the seed script repopulates dev data.

- [ ] **Step 7: Typecheck and commit**

Run: `pnpm --filter @headless-lms/api typecheck`
Expected: exits 0.

```bash
git add apps/api/src/adapters/db/schema apps/api/src/core/shared/id.ts apps/api/drizzle
git commit -m "feat(api): integrations/connections/secrets tables in baseline + slack seed

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: SecretStore port + `adapters/db/secrets.ts` (crypto + store)

The generic encrypted-storage port (any domain may store any JSON value; credentials are just this context's use of it), and its single adapter file `adapters/db/secrets.ts`: pure AES-256-GCM crypto functions (fully unit-tested, no DB) plus the thin `DrizzleSecretStore` that composes them with the `secrets` table. Also plumbs `SECRETS_ENCRYPTION_KEY` into the root `.env`, `.env.example`, and the api vitest config (server-boot tests construct the container, and the store fail-fasts on a bad key).

**Files:**
- Modify: `apps/api/src/core/shared/ports.ts` (append `SecretStore`)
- Create: `apps/api/src/adapters/db/secrets.ts`
- Test: `apps/api/src/adapters/db/secrets.test.ts` (create)
- Modify: `apps/api/vitest.config.ts`
- Modify: `.env` and `.env.example` (repo root)

**Interfaces:**
- Consumes: `secrets` table (Task 1).
- Produces (port, consumed by Tasks 3 and 5):

```ts
export interface SecretStore {
  put(orgId: string, value: Record<string, unknown>): Promise<string>;
  get(orgId: string, id: string): Promise<Record<string, unknown> | null>;
  remove(orgId: string, id: string): Promise<void>;
}
```

- Produces (adapter, consumed by Task 5): `class DrizzleSecretStore implements SecretStore` with `constructor(db: NodePgDatabase, keyBase64: string | undefined)` — the constructor throws on a missing/invalid key so the server fails to boot rather than running unencrypted. Also exports `parseSecretsKey`, `encryptJson`, `decryptJson`, `interface EncryptedSecret { ciphertext: string; iv: string; authTag: string }`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/adapters/db/secrets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { decryptJson, encryptJson, parseSecretsKey } from "./secrets.js";

// base64 of the 32 ascii bytes "0123456789abcdef0123456789abcdef"
const KEY_B64 = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

describe("parseSecretsKey", () => {
  it("decodes a valid 32-byte base64 key", () => {
    expect(parseSecretsKey(KEY_B64).length).toBe(32);
  });

  it("throws when the key is missing", () => {
    expect(() => parseSecretsKey(undefined)).toThrow(/SECRETS_ENCRYPTION_KEY/);
    expect(() => parseSecretsKey("")).toThrow(/SECRETS_ENCRYPTION_KEY/);
  });

  it("throws when the key does not decode to 32 bytes", () => {
    expect(() => parseSecretsKey(Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });
});

describe("encryptJson / decryptJson", () => {
  const key = parseSecretsKey(KEY_B64);

  it("roundtrips a JSON value", () => {
    const value = { botToken: "xoxb-secret", nested: { n: 1 } };
    const enc = encryptJson(key, value);
    expect(decryptJson(key, enc)).toEqual(value);
  });

  it("uses a fresh IV per encryption (same plaintext, different ciphertext)", () => {
    const a = encryptJson(key, { botToken: "xoxb-secret" });
    const b = encryptJson(key, { botToken: "xoxb-secret" });
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("throws on tampered ciphertext (GCM auth failure)", () => {
    const enc = encryptJson(key, { botToken: "xoxb-secret" });
    const tampered = Buffer.from(enc.ciphertext, "base64");
    tampered[0] = tampered[0]! ^ 0xff;
    expect(() =>
      decryptJson(key, { ...enc, ciphertext: tampered.toString("base64") }),
    ).toThrow();
  });

  it("throws when decrypting with the wrong key", () => {
    const enc = encryptJson(key, { botToken: "xoxb-secret" });
    const wrongKey = parseSecretsKey(Buffer.alloc(32, 7).toString("base64"));
    expect(() => decryptJson(wrongKey, enc)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @headless-lms/api test src/adapters/db/secrets.test.ts`
Expected: FAIL — cannot resolve `./secrets.js`.

- [ ] **Step 3: Implement the port and the adapter**

Append to `apps/api/src/core/shared/ports.ts` (after the `ObjectStorage` block):

```ts
// --- Secret store (encrypted at rest) ----------------------------------------
// Outbound port for org-scoped encrypted JSON storage. Values are encrypted at
// rest and decrypted only inside `get`, at the point of use. Secrets are
// immutable: rotation is put-new → repoint the caller's reference → remove-old.
// Integrations stores connection credentials through it; any domain may store
// any JSON value.

export interface SecretStore {
  /** Encrypt and persist a value; returns the secret id. */
  put(orgId: string, value: Record<string, unknown>): Promise<string>;
  /** Decrypt at point of use. Null if absent. */
  get(orgId: string, id: string): Promise<Record<string, unknown> | null>;
  /** Permanently remove. */
  remove(orgId: string, id: string): Promise<void>;
}
```

Create `apps/api/src/adapters/db/secrets.ts`:

```ts
// SecretStore — Drizzle adapter + AES-256-GCM primitives, in one module.
// The crypto functions are pure (no DB, no env reads) so they unit-test in
// isolation; DrizzleSecretStore composes them with the org-scoped `secrets`
// table, which this adapter owns exclusively. GCM gives confidentiality +
// integrity in one mode: a tampered ciphertext or a wrong key throws on
// decrypt instead of returning garbage. The key is validated at construction:
// a missing or malformed SECRETS_ENCRYPTION_KEY fails the boot instead of
// running unencrypted.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { SecretStore } from "../../core/shared/ports.js";
import { secrets } from "./schema/index.js";

/** The three base64 columns persisted per secret. */
export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/** Validate + decode the base64 SECRETS_ENCRYPTION_KEY (must be 32 bytes). */
export function parseSecretsKey(base64: string | undefined): Buffer {
  if (!base64) throw new Error("SECRETS_ENCRYPTION_KEY is not set");
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error("SECRETS_ENCRYPTION_KEY must decode to 32 bytes");
  return key;
}

export function encryptJson(key: Buffer, value: Record<string, unknown>): EncryptedSecret {
  const iv = randomBytes(12); // 96-bit nonce, the GCM standard
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptJson(key: Buffer, secret: EncryptedSecret): Record<string, unknown> {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(secret.iv, "base64"));
  decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as Record<string, unknown>;
}

export class DrizzleSecretStore implements SecretStore {
  private readonly key: Buffer;

  constructor(
    private readonly db: NodePgDatabase,
    keyBase64: string | undefined,
  ) {
    this.key = parseSecretsKey(keyBase64);
  }

  async put(orgId: string, value: Record<string, unknown>): Promise<string> {
    const encrypted = encryptJson(this.key, value);
    const [row] = await this.db
      .insert(secrets)
      .values({ orgId, ...encrypted })
      .returning({ id: secrets.id });
    if (!row) throw new Error("failed to store secret");
    return row.id;
  }

  async get(orgId: string, id: string): Promise<Record<string, unknown> | null> {
    const [row] = await this.db
      .select({ ciphertext: secrets.ciphertext, iv: secrets.iv, authTag: secrets.authTag })
      .from(secrets)
      .where(and(eq(secrets.orgId, orgId), eq(secrets.id, id)))
      .limit(1);
    if (!row) return null;
    return decryptJson(this.key, row);
  }

  async remove(orgId: string, id: string): Promise<void> {
    await this.db.delete(secrets).where(and(eq(secrets.orgId, orgId), eq(secrets.id, id)));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @headless-lms/api test src/adapters/db/secrets.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Add the key to the test environment**

Replace `apps/api/vitest.config.ts` with:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
    env: {
      // Server-boot tests construct the container, whose SecretStore
      // fail-fasts on a missing key. Fixed test-only key (base64, 32 bytes).
      SECRETS_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    },
  },
});
```

- [ ] **Step 6: Add the key to the env files**

Append to `.env.example` (repo root):

```
# 32-byte base64 key for the SecretStore (AES-256-GCM). Generate: openssl rand -base64 32
SECRETS_ENCRYPTION_KEY=""
```

Append to `.env` (repo root) with a real generated value:

Run: `echo "SECRETS_ENCRYPTION_KEY=\"$(openssl rand -base64 32)\"" >> .env`
Expected: `.env` now ends with a `SECRETS_ENCRYPTION_KEY="..."` line (44-char base64 value).

- [ ] **Step 7: Typecheck and run the api suite**

Run: `pnpm --filter @headless-lms/api typecheck && pnpm --filter @headless-lms/api test`
Expected: both exit 0.

- [ ] **Step 8: Commit** (never commit `.env`)

```bash
git add apps/api/src/core/shared/ports.ts apps/api/src/adapters/db/secrets.ts apps/api/src/adapters/db/secrets.test.ts apps/api/vitest.config.ts .env.example
git commit -m "feat(api): SecretStore port + AES-256-GCM secrets adapter

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Core context `core/integrations/`

The seventh context, standard file contract. Service owns the connection lifecycle; it never calls the external service. Also registers the context with the ESLint boundary rules.

**Files:**
- Create: `apps/api/src/core/integrations/model.ts`
- Create: `apps/api/src/core/integrations/ports.ts`
- Create: `apps/api/src/core/integrations/service.ts`
- Create: `apps/api/src/core/integrations/index.ts`
- Test: `apps/api/src/core/integrations/service.test.ts` (create)
- Modify: `.eslintrc.cjs` (add `"integrations"` to `CONTEXTS`)

**Interfaces:**
- Consumes: `SecretStore` from `core/shared/ports.ts` (Task 2).
- Produces (consumed by Tasks 4, 5, 6): everything exported from `core/integrations/index.ts` — `IntegrationsServiceImpl` (constructor `(repo: IntegrationsRepository, secretStore: SecretStore)`), the `IntegrationsService` / `IntegrationsRepository` ports, models `Integration`, `Connection`, `ConnectionStatus`, `ConnectInput`, `UpdateConnectionInput`, `ResolvedConnection`, errors `IntegrationNotFoundError`, `AlreadyConnectedError`.

- [ ] **Step 1: Write the models and ports**

Create `apps/api/src/core/integrations/model.ts`:

```ts
// integrations context — domain entities & DTOs. Framework-free.
// An integration is a pre-built catalog entry for an external service; a
// connection is an org's authenticated link to one. Secrets live in the shared
// secret store — a connection carries only the reference. This domain owns the
// connection and its lifecycle; it never calls the external service.

export interface Integration {
  readonly id: string; // catalog slug, e.g. "slack"
  name: string;
  description: string;
}

export type ConnectionStatus = "active" | "disabled";

export interface Connection {
  readonly id: string;
  integrationId: string;
  config: Record<string, unknown>;
  status: ConnectionStatus;
  secretId: string;
  createdAt: string;
  updatedAt: string;
}

/** A connection resolved with its decrypted secrets, for callers that act on it. */
export interface ResolvedConnection extends Connection {
  secrets: Record<string, unknown>;
}

export interface ConnectInput {
  integrationId: string;
  config: Record<string, unknown>;
  secrets: Record<string, unknown>;
}

export interface UpdateConnectionInput {
  config?: Record<string, unknown> | undefined;
  /** Omitted = keep the existing secret; present = rotate it. */
  secrets?: Record<string, unknown> | undefined;
  status?: ConnectionStatus | undefined;
}

/** Connect targeted an integration that is not in the (enabled) catalog. */
export class IntegrationNotFoundError extends Error {}
/** Connect targeted an integration the org is already connected to. */
export class AlreadyConnectedError extends Error {}
```

Create `apps/api/src/core/integrations/ports.ts`:

```ts
// integrations context — ports.
import type {
  ConnectInput,
  Connection,
  ConnectionStatus,
  Integration,
  ResolvedConnection,
  UpdateConnectionInput,
} from "./model.js";

// Inbound port (use cases the service exposes).
export interface IntegrationsService {
  listIntegrations(): Promise<Integration[]>;
  listConnections(orgId: string): Promise<Connection[]>;
  connect(orgId: string, input: ConnectInput): Promise<Connection>;
  update(orgId: string, id: string, input: UpdateConnectionInput): Promise<Connection | null>;
  disconnect(orgId: string, id: string): Promise<boolean>;
  /**
   * The org's connection for an integration, with decrypted secrets — for
   * internal callers (billing, automations, workers) that construct their own
   * adapter from it. Never exposed over HTTP.
   */
  getConnection(orgId: string, integrationId: string): Promise<ResolvedConnection | null>;
}

// Outbound port (persistence contract the repository fulfils).
export interface IntegrationsRepository {
  /** Enabled catalog entries. */
  listIntegrations(): Promise<Integration[]>;
  /** An enabled catalog entry, or null. */
  getIntegration(id: string): Promise<Integration | null>;
  listConnections(orgId: string): Promise<Connection[]>;
  findConnectionById(orgId: string, id: string): Promise<Connection | null>;
  findConnectionByIntegration(orgId: string, integrationId: string): Promise<Connection | null>;
  insertConnection(
    orgId: string,
    data: { integrationId: string; config: Record<string, unknown>; secretId: string },
  ): Promise<Connection>;
  updateConnection(
    orgId: string,
    id: string,
    patch: { config?: Record<string, unknown>; status?: ConnectionStatus; secretId?: string },
  ): Promise<Connection | null>;
  deleteConnection(orgId: string, id: string): Promise<boolean>;
}
```

- [ ] **Step 2: Write the failing service tests**

Create `apps/api/src/core/integrations/service.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { IntegrationsServiceImpl } from "./service.js";
import type { IntegrationsRepository } from "./ports.js";
import type { Connection, Integration } from "./model.js";
import { AlreadyConnectedError, IntegrationNotFoundError } from "./model.js";
import type { SecretStore } from "../shared/ports.js";

const SLACK: Integration = { id: "slack", name: "Slack", description: "Post to a channel." };

const CONN: Connection = {
  id: "con_1",
  integrationId: "slack",
  config: { channel: "#general" },
  status: "active",
  secretId: "sec_1",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

type FakeSecretStore = SecretStore & { data: Map<string, Record<string, unknown>> };
function fakeSecretStore(): FakeSecretStore {
  const data = new Map<string, Record<string, unknown>>();
  // Ids start at 101 so freshly-put secrets never collide with CONN.secretId
  // ("sec_1") — the rotation test must distinguish new from old.
  let n = 100;
  return {
    data,
    put: vi.fn(async (orgId: string, value: Record<string, unknown>) => {
      const id = `sec_${++n}`;
      data.set(`${orgId}/${id}`, value);
      return id;
    }),
    get: vi.fn(async (orgId: string, id: string) => data.get(`${orgId}/${id}`) ?? null),
    remove: vi.fn(async (orgId: string, id: string) => {
      data.delete(`${orgId}/${id}`);
    }),
  };
}

function fakeRepo(over?: Partial<IntegrationsRepository>): IntegrationsRepository {
  return {
    listIntegrations: vi.fn().mockResolvedValue([SLACK]),
    getIntegration: vi.fn().mockResolvedValue(SLACK),
    listConnections: vi.fn().mockResolvedValue([CONN]),
    findConnectionById: vi.fn().mockResolvedValue(CONN),
    findConnectionByIntegration: vi.fn().mockResolvedValue(null),
    insertConnection: vi.fn().mockResolvedValue(CONN),
    updateConnection: vi.fn().mockResolvedValue(CONN),
    deleteConnection: vi.fn().mockResolvedValue(true),
    ...over,
  };
}

function build(over?: Partial<IntegrationsRepository>) {
  const repo = fakeRepo(over);
  const secretStore = fakeSecretStore();
  const svc = new IntegrationsServiceImpl(repo, secretStore);
  return { repo, secretStore, svc };
}

describe("IntegrationsService", () => {
  it("lists the catalog via the repository", async () => {
    const { svc } = build();
    expect(await svc.listIntegrations()).toEqual([SLACK]);
  });

  it("lists an org's connections via the repository", async () => {
    const { repo, svc } = build();
    expect(await svc.listConnections("org-1")).toEqual([CONN]);
    expect(repo.listConnections).toHaveBeenCalledWith("org-1");
  });

  describe("connect", () => {
    it("stores the secret and inserts the connection", async () => {
      const { repo, secretStore, svc } = build();
      const result = await svc.connect("org-1", {
        integrationId: "slack",
        config: { channel: "#general" },
        secrets: { botToken: "xoxb-1" },
      });
      expect(secretStore.put).toHaveBeenCalledWith("org-1", { botToken: "xoxb-1" });
      expect(repo.insertConnection).toHaveBeenCalledWith("org-1", {
        integrationId: "slack",
        config: { channel: "#general" },
        secretId: "sec_101",
      });
      expect(result).toEqual(CONN);
    });

    it("rejects an unknown integration without touching the secret store", async () => {
      const { secretStore, svc } = build({ getIntegration: vi.fn().mockResolvedValue(null) });
      await expect(
        svc.connect("org-1", { integrationId: "nope", config: {}, secrets: {} }),
      ).rejects.toBeInstanceOf(IntegrationNotFoundError);
      expect(secretStore.put).not.toHaveBeenCalled();
    });

    it("rejects when the org is already connected to the integration", async () => {
      const { secretStore, svc } = build({
        findConnectionByIntegration: vi.fn().mockResolvedValue(CONN),
      });
      await expect(
        svc.connect("org-1", { integrationId: "slack", config: {}, secrets: {} }),
      ).rejects.toBeInstanceOf(AlreadyConnectedError);
      expect(secretStore.put).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("patches config/status without touching secrets when none are given", async () => {
      const { repo, secretStore, svc } = build();
      const result = await svc.update("org-1", "con_1", {
        config: { channel: "#alerts" },
        status: "disabled",
      });
      expect(repo.updateConnection).toHaveBeenCalledWith("org-1", "con_1", {
        config: { channel: "#alerts" },
        status: "disabled",
      });
      expect(secretStore.put).not.toHaveBeenCalled();
      expect(secretStore.remove).not.toHaveBeenCalled();
      expect(result).toEqual(CONN);
    });

    it("rotates the secret when secrets are given: put new, repoint, remove old", async () => {
      const { repo, secretStore, svc } = build();
      await svc.update("org-1", "con_1", { secrets: { botToken: "xoxb-2" } });
      expect(secretStore.put).toHaveBeenCalledWith("org-1", { botToken: "xoxb-2" });
      // Repointed to the NEW secret, and the OLD one removed.
      expect(repo.updateConnection).toHaveBeenCalledWith("org-1", "con_1", { secretId: "sec_101" });
      expect(secretStore.remove).toHaveBeenCalledWith("org-1", "sec_1");
    });

    it("returns null for a missing connection", async () => {
      const { secretStore, svc } = build({ findConnectionById: vi.fn().mockResolvedValue(null) });
      expect(await svc.update("org-1", "nope", { status: "disabled" })).toBeNull();
      expect(secretStore.put).not.toHaveBeenCalled();
    });
  });

  describe("disconnect", () => {
    it("deletes the connection and removes its secret", async () => {
      const { repo, secretStore, svc } = build();
      expect(await svc.disconnect("org-1", "con_1")).toBe(true);
      expect(repo.deleteConnection).toHaveBeenCalledWith("org-1", "con_1");
      expect(secretStore.remove).toHaveBeenCalledWith("org-1", "sec_1");
    });

    it("returns false for a missing connection", async () => {
      const { secretStore, svc } = build({ findConnectionById: vi.fn().mockResolvedValue(null) });
      expect(await svc.disconnect("org-1", "nope")).toBe(false);
      expect(secretStore.remove).not.toHaveBeenCalled();
    });
  });

  describe("getConnection", () => {
    it("returns the connection with decrypted secrets", async () => {
      const { secretStore, svc } = build({
        findConnectionByIntegration: vi.fn().mockResolvedValue(CONN),
      });
      secretStore.data.set("org-1/sec_1", { botToken: "xoxb-1" });
      const result = await svc.getConnection("org-1", "slack");
      expect(result).toEqual({ ...CONN, secrets: { botToken: "xoxb-1" } });
    });

    it("returns null when the org has no connection for the integration", async () => {
      const { svc } = build();
      expect(await svc.getConnection("org-1", "slack")).toBeNull();
    });

    it("throws when the referenced secret is missing (never silently partial)", async () => {
      const { svc } = build({ findConnectionByIntegration: vi.fn().mockResolvedValue(CONN) });
      await expect(svc.getConnection("org-1", "slack")).rejects.toThrow(/secret missing/);
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @headless-lms/api test src/core/integrations/service.test.ts`
Expected: FAIL — cannot resolve `./service.js`.

- [ ] **Step 4: Implement the service and public surface**

Create `apps/api/src/core/integrations/service.ts`:

```ts
// integrations context — service implementation (inbound port).
// Owns the connection lifecycle. Never calls the external service; callers
// take the resolved connection and construct their own adapter.
import type { SecretStore } from "../shared/ports.js";
import { AlreadyConnectedError, IntegrationNotFoundError } from "./model.js";
import type {
  ConnectInput,
  Connection,
  ConnectionStatus,
  Integration,
  ResolvedConnection,
  UpdateConnectionInput,
} from "./model.js";
import type { IntegrationsRepository, IntegrationsService } from "./ports.js";

export class IntegrationsServiceImpl implements IntegrationsService {
  constructor(
    private readonly repo: IntegrationsRepository,
    private readonly secretStore: SecretStore,
  ) {}

  listIntegrations(): Promise<Integration[]> {
    return this.repo.listIntegrations();
  }

  listConnections(orgId: string): Promise<Connection[]> {
    return this.repo.listConnections(orgId);
  }

  async connect(orgId: string, input: ConnectInput): Promise<Connection> {
    const integration = await this.repo.getIntegration(input.integrationId);
    if (!integration)
      throw new IntegrationNotFoundError(`unknown integration: ${input.integrationId}`);
    const existing = await this.repo.findConnectionByIntegration(orgId, input.integrationId);
    if (existing) throw new AlreadyConnectedError(`already connected to ${input.integrationId}`);
    const secretId = await this.secretStore.put(orgId, input.secrets);
    return this.repo.insertConnection(orgId, {
      integrationId: input.integrationId,
      config: input.config,
      secretId,
    });
  }

  async update(orgId: string, id: string, input: UpdateConnectionInput): Promise<Connection | null> {
    const existing = await this.repo.findConnectionById(orgId, id);
    if (!existing) return null;
    // Secrets are immutable in the store: rotation is put-new → repoint → remove-old.
    const patch: { config?: Record<string, unknown>; status?: ConnectionStatus; secretId?: string } =
      {};
    if (input.config !== undefined) patch.config = input.config;
    if (input.status !== undefined) patch.status = input.status;
    if (input.secrets !== undefined) patch.secretId = await this.secretStore.put(orgId, input.secrets);
    const updated = await this.repo.updateConnection(orgId, id, patch);
    if (!updated) return null;
    if (input.secrets !== undefined) await this.secretStore.remove(orgId, existing.secretId);
    return updated;
  }

  async disconnect(orgId: string, id: string): Promise<boolean> {
    const existing = await this.repo.findConnectionById(orgId, id);
    if (!existing) return false;
    // Connection first (it references the secret), then the secret.
    await this.repo.deleteConnection(orgId, id);
    await this.secretStore.remove(orgId, existing.secretId);
    return true;
  }

  async getConnection(orgId: string, integrationId: string): Promise<ResolvedConnection | null> {
    const connection = await this.repo.findConnectionByIntegration(orgId, integrationId);
    if (!connection) return null;
    const secrets = await this.secretStore.get(orgId, connection.secretId);
    if (!secrets) throw new Error(`secret missing for connection ${connection.id}`);
    return { ...connection, secrets };
  }
}
```

Create `apps/api/src/core/integrations/index.ts`:

```ts
// integrations context — public surface. Re-export only what other contexts may use.
export { IntegrationsServiceImpl } from "./service.js";
export type { IntegrationsService, IntegrationsRepository } from "./ports.js";
export { AlreadyConnectedError, IntegrationNotFoundError } from "./model.js";
export type {
  ConnectInput,
  Connection,
  ConnectionStatus,
  Integration,
  ResolvedConnection,
  UpdateConnectionInput,
} from "./model.js";
```

In `.eslintrc.cjs`, extend the contexts list:

```js
const CONTEXTS = [
  "identity",
  "organizations",
  "courses",
  "entitlements",
  "progress",
  "assets",
  "integrations",
];
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @headless-lms/api test src/core/integrations/service.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 6: Lint and commit**

Run: `pnpm --filter @headless-lms/api lint`
Expected: exits 0 (boundary rules see the new context).

```bash
git add apps/api/src/core/integrations .eslintrc.cjs
git commit -m "feat(api): integrations core context

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Drizzle integrations repository

Implements `IntegrationsRepository` against the Task 1 tables. Matches the repo convention: repositories have no unit tests (they're exercised through the running app); logic-free row mapping only.

**Files:**
- Create: `apps/api/src/adapters/db/repositories/integrations.ts`

**Interfaces:**
- Consumes: `IntegrationsRepository` port and models (Task 3), `integrations`/`connections` tables (Task 1).
- Produces (consumed by Task 5): `class DrizzleIntegrationsRepository implements IntegrationsRepository` with `constructor(db: NodePgDatabase)`.

- [ ] **Step 1: Implement the repository**

Create `apps/api/src/adapters/db/repositories/integrations.ts`:

```ts
// integrations — Drizzle repository (implements the core outbound port).
// Catalog reads return enabled rows only; connection rows are org-scoped.
// The `secrets` table is NOT touched here — it belongs to the SecretStore.
import { and, asc, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { IntegrationsRepository } from "../../../core/integrations/ports.js";
import type {
  Connection,
  ConnectionStatus,
  Integration,
} from "../../../core/integrations/model.js";
import { connections, integrations } from "../schema/index.js";

const integrationSelection = {
  id: integrations.id,
  name: integrations.name,
  description: integrations.description,
} as const;

const connectionSelection = {
  id: connections.id,
  integrationId: connections.integrationId,
  config: connections.config,
  secretId: connections.secretId,
  status: connections.status,
  createdAt: connections.createdAt,
  updatedAt: connections.updatedAt,
} as const;

interface ConnectionRow {
  id: string;
  integrationId: string;
  config: Record<string, unknown>;
  secretId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toConnection(row: ConnectionRow): Connection {
  return {
    id: row.id,
    integrationId: row.integrationId,
    config: row.config,
    status: row.status as ConnectionStatus,
    secretId: row.secretId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class DrizzleIntegrationsRepository implements IntegrationsRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async listIntegrations(): Promise<Integration[]> {
    return this.db
      .select(integrationSelection)
      .from(integrations)
      .where(eq(integrations.enabled, true))
      .orderBy(asc(integrations.name));
  }

  async getIntegration(id: string): Promise<Integration | null> {
    const [row] = await this.db
      .select(integrationSelection)
      .from(integrations)
      .where(and(eq(integrations.id, id), eq(integrations.enabled, true)))
      .limit(1);
    return row ?? null;
  }

  async listConnections(orgId: string): Promise<Connection[]> {
    const rows = await this.db
      .select(connectionSelection)
      .from(connections)
      .where(eq(connections.orgId, orgId))
      .orderBy(desc(connections.createdAt));
    return rows.map(toConnection);
  }

  async findConnectionById(orgId: string, id: string): Promise<Connection | null> {
    const [row] = await this.db
      .select(connectionSelection)
      .from(connections)
      .where(and(eq(connections.orgId, orgId), eq(connections.id, id)))
      .limit(1);
    return row ? toConnection(row) : null;
  }

  async findConnectionByIntegration(orgId: string, integrationId: string): Promise<Connection | null> {
    const [row] = await this.db
      .select(connectionSelection)
      .from(connections)
      .where(and(eq(connections.orgId, orgId), eq(connections.integrationId, integrationId)))
      .limit(1);
    return row ? toConnection(row) : null;
  }

  async insertConnection(
    orgId: string,
    data: { integrationId: string; config: Record<string, unknown>; secretId: string },
  ): Promise<Connection> {
    const [row] = await this.db
      .insert(connections)
      .values({
        orgId,
        integrationId: data.integrationId,
        config: data.config,
        secretId: data.secretId,
      })
      .returning(connectionSelection);
    if (!row) throw new Error("failed to insert connection");
    return toConnection(row);
  }

  async updateConnection(
    orgId: string,
    id: string,
    patch: { config?: Record<string, unknown>; status?: ConnectionStatus; secretId?: string },
  ): Promise<Connection | null> {
    const [row] = await this.db
      .update(connections)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(connections.orgId, orgId), eq(connections.id, id)))
      .returning(connectionSelection);
    return row ? toConnection(row) : null;
  }

  async deleteConnection(orgId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(connections)
      .where(and(eq(connections.orgId, orgId), eq(connections.id, id)))
      .returning({ id: connections.id });
    return rows.length > 0;
  }
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm --filter @headless-lms/api typecheck && pnpm --filter @headless-lms/api lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/adapters/db/repositories/integrations.ts
git commit -m "feat(api): Drizzle integrations repository

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Container + config wiring

**Files:**
- Modify: `apps/api/src/composition/container.ts`
- Modify: `apps/api/src/composition/config.ts`

**Interfaces:**
- Consumes: `DrizzleSecretStore` (Task 2), `IntegrationsServiceImpl` (Task 3), `DrizzleIntegrationsRepository` (Task 4).
- Produces (consumed by Task 6): `Container.integrations: IntegrationsServiceImpl`, `Container.secretStore: DrizzleSecretStore`, `Config.secretsEncryptionKey: string`.

- [ ] **Step 1: Wire config**

In `apps/api/src/composition/config.ts`, inside the object returned by `loadConfigFromEnv()`, add after `authSecret`:

```ts
    secretsEncryptionKey: process.env.SECRETS_ENCRYPTION_KEY ?? "",
```

- [ ] **Step 2: Wire the container**

In `apps/api/src/composition/container.ts`:

Add imports (with the other core/adapters imports):

```ts
import { IntegrationsServiceImpl } from "../core/integrations/index.js";
import { DrizzleSecretStore } from "../adapters/db/secrets.js";
import { DrizzleIntegrationsRepository } from "../adapters/db/repositories/integrations.js";
```

In `interface Config`, add after `authSecret: string;`:

```ts
  /** Base64 32-byte key for the SecretStore (AES-256-GCM). */
  secretsEncryptionKey: string;
```

In `interface Container`, add `integrations` to the domains block (after `assets`) and `secretStore` next to `storage`:

```ts
  integrations: IntegrationsServiceImpl;
```
```ts
  secretStore: DrizzleSecretStore;
```

In `buildContainer`, add after the `assets` service construction:

```ts
  // Fail-fast: an invalid SECRETS_ENCRYPTION_KEY aborts the boot rather than
  // running unencrypted.
  const secretStore = new DrizzleSecretStore(db, config.secretsEncryptionKey);
  const integrations = new IntegrationsServiceImpl(
    new DrizzleIntegrationsRepository(db),
    secretStore,
  );
```

Add `integrations,` and `secretStore,` to the returned object.

- [ ] **Step 3: Verify the whole api suite (server-boot tests now construct the store)**

Run: `pnpm --filter @headless-lms/api typecheck && pnpm --filter @headless-lms/api test`
Expected: both exit 0 — the vitest `env` key from Task 2 satisfies the fail-fast constructor.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/composition/container.ts apps/api/src/composition/config.ts
git commit -m "feat(api): wire secret store + integrations service into the container

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Contract, routes, SDK

Schema-first HTTP surface, tag `Integrations`. Secrets are write-only: request unions carry them; `Connection` responses never do.

**Files:**
- Create: `packages/api-contract/src/integrations.ts`
- Modify: `packages/api-contract/src/index.ts` (add export)
- Create: `apps/api/src/http/routes/integrations.ts`
- Modify: `apps/api/src/http/routes.ts` (register)
- Generated: `packages/sdk/openapi.json`, `packages/sdk/src/generated/**` (committed)

**Interfaces:**
- Consumes: `Container.integrations` (Task 5), core errors (Task 3), `resolveScope` (existing).
- Produces (consumed by Task 7): SDK class `Integrations` with `listIntegrations`, `listConnections`, `createConnection`, `updateConnection`, `deleteConnection`; contract schemas `Integration`, `IntegrationsList`, `Connection`, `ConnectionsList`, `ConnectionStatus`, `CreateConnection`, `UpdateConnection`, `ConnectionIdParam`.

- [ ] **Step 1: Write the contract**

Create `packages/api-contract/src/integrations.ts`:

```ts
// Integrations resource contract: the global integration catalog and an org's
// connections to it. Secrets are WRITE-ONLY on this surface: request bodies
// carry them in; no response schema ever includes them. Per-integration
// config/secret shapes are typed as a discriminated union on `integrationId`
// so the SDK gives each integration's form compile-time shapes.
import { z } from "zod";

export const Integration = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
});
export type Integration = z.infer<typeof Integration>;

export const IntegrationsList = z.array(Integration);
export type IntegrationsList = z.infer<typeof IntegrationsList>;

export const ConnectionStatus = z.enum(["active", "disabled"]);
export type ConnectionStatus = z.infer<typeof ConnectionStatus>;

export const Connection = z.object({
  id: z.string(),
  integrationId: z.string(),
  config: z.record(z.string(), z.unknown()),
  status: ConnectionStatus,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Connection = z.infer<typeof Connection>;

export const ConnectionsList = z.array(Connection);
export type ConnectionsList = z.infer<typeof ConnectionsList>;

// --- per-integration shapes --------------------------------------------------

export const SlackConfig = z.object({ channel: z.string().min(1) });
export type SlackConfig = z.infer<typeof SlackConfig>;

export const SlackSecrets = z.object({ botToken: z.string().min(1) });
export type SlackSecrets = z.infer<typeof SlackSecrets>;

export const CreateConnection = z.discriminatedUnion("integrationId", [
  z.object({ integrationId: z.literal("slack"), config: SlackConfig, secrets: SlackSecrets }),
]);
export type CreateConnection = z.infer<typeof CreateConnection>;

export const UpdateConnection = z.discriminatedUnion("integrationId", [
  z.object({
    integrationId: z.literal("slack"),
    config: SlackConfig.optional(),
    // Omitted = keep the existing secret; present = rotate it.
    secrets: SlackSecrets.optional(),
    status: ConnectionStatus.optional(),
  }),
]);
export type UpdateConnection = z.infer<typeof UpdateConnection>;

export const ConnectionIdParam = z.object({ id: z.string() });
export type ConnectionIdParam = z.infer<typeof ConnectionIdParam>;
```

In `packages/api-contract/src/index.ts`, add after `export * from "./connected-apps.js";`:

```ts
export * from "./integrations.js";
```

- [ ] **Step 2: Build the contract**

Run: `pnpm --filter @headless-lms/api-contract build`
Expected: exits 0.

- [ ] **Step 3: Write the routes**

Create `apps/api/src/http/routes/integrations.ts`:

```ts
// HTTP routes for the integrations context (catalog + org connections).
// Secrets are write-only here: bodies carry them in; responses never do.
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  Connection,
  ConnectionIdParam,
  ConnectionsList,
  CreateConnection,
  ErrorBody,
  IntegrationsList,
  UpdateConnection,
} from "@headless-lms/api-contract";
import { AlreadyConnectedError, IntegrationNotFoundError } from "../../core/integrations/index.js";
import type { Container } from "../../composition/container.js";
import { resolveScope } from "../scope.js";

export async function integrationsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ["Integrations"];
  const svc = container.integrations;

  r.route({
    method: "GET",
    url: "/api/integrations",
    preHandler: app.requireSession,
    schema: {
      operationId: "listIntegrations",
      tags,
      summary: "List the integration catalog",
      response: { 200: IntegrationsList },
    },
    handler: async () => svc.listIntegrations(),
  });

  r.route({
    method: "GET",
    url: "/api/integrations/connections",
    preHandler: app.requireSession,
    schema: {
      operationId: "listConnections",
      tags,
      summary: "List the org's integration connections",
      response: { 200: ConnectionsList },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return svc.listConnections(scope.orgId);
    },
  });

  r.route({
    method: "POST",
    url: "/api/integrations/connections",
    preHandler: app.requireSession,
    schema: {
      operationId: "createConnection",
      tags,
      summary: "Connect an integration",
      body: CreateConnection,
      response: { 201: Connection, 400: ErrorBody, 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      try {
        const connection = await svc.connect(scope.orgId, req.body);
        return await reply.code(201).send(connection);
      } catch (e) {
        if (e instanceof IntegrationNotFoundError)
          return reply.code(400).send({ error: "unknown_integration", message: e.message });
        if (e instanceof AlreadyConnectedError)
          return reply.code(409).send({ error: "already_connected", message: e.message });
        throw e;
      }
    },
  });

  r.route({
    method: "PATCH",
    url: "/api/integrations/connections/:id",
    preHandler: app.requireSession,
    schema: {
      operationId: "updateConnection",
      tags,
      summary: "Update a connection (config, status, or rotate its secret)",
      params: ConnectionIdParam,
      body: UpdateConnection,
      response: { 200: Connection, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      // The discriminator types the body per integration; the service doesn't need it.
      const { integrationId: _integrationId, ...patch } = req.body;
      const connection = await svc.update(scope.orgId, req.params.id, patch);
      if (!connection)
        return reply.code(404).send({ error: "not_found", message: "Connection not found" });
      return connection;
    },
  });

  r.route({
    method: "DELETE",
    url: "/api/integrations/connections/:id",
    preHandler: app.requireSession,
    schema: {
      operationId: "deleteConnection",
      tags,
      summary: "Disconnect an integration (removes its secret)",
      params: ConnectionIdParam,
      response: { 204: z.void(), 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const removed = await svc.disconnect(scope.orgId, req.params.id);
      if (!removed)
        return reply.code(404).send({ error: "not_found", message: "Connection not found" });
      return reply.code(204).send();
    },
  });
}
```

In `apps/api/src/http/routes.ts`: add the import

```ts
import { integrationsRoutes } from "./routes/integrations.js";
```

and inside the session-guarded plugin, after `await connectedAppsRoutes(instance, container);`:

```ts
    await integrationsRoutes(instance, container);
```

- [ ] **Step 4: Verify api build state**

Run: `pnpm --filter @headless-lms/api typecheck && pnpm --filter @headless-lms/api lint && pnpm --filter @headless-lms/api test`
Expected: all exit 0.

- [ ] **Step 5: Regenerate the SDK (dev Postgres must be running; `.env` must have `SECRETS_ENCRYPTION_KEY` from Task 2)**

Run: `pnpm gen:sdk`
Expected: exits 0; `packages/sdk/openapi.json` gains the five `Integrations`-tagged operations; `packages/sdk/src/generated/` gains an `Integrations` class with `listIntegrations`, `listConnections`, `createConnection`, `updateConnection`, `deleteConnection`.

- [ ] **Step 6: Commit (generated files are committed by convention)**

```bash
git add packages/api-contract/src/integrations.ts packages/api-contract/src/index.ts apps/api/src/http/routes/integrations.ts apps/api/src/http/routes.ts packages/sdk
git commit -m "feat(api): integrations contract, routes, and generated SDK

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Admin — `/settings/integrations`

Manager-only settings page: the catalog with each integration's connection state; connect/manage via a Slack-specific sheet (typed, no generic form machinery); disconnect via confirm dialog. Follows the settings pages' server-loaded + server-actions pattern.

**Files:**
- Modify: `apps/admin/src/lib/api/types.ts`
- Modify: `apps/admin/src/lib/api/server.ts`
- Modify: `apps/admin/src/app/(dashboard)/settings/settings-nav.tsx`
- Create: `apps/admin/src/app/(dashboard)/settings/integrations/page.tsx`
- Create: `apps/admin/src/app/(dashboard)/settings/integrations/actions.ts`
- Create: `apps/admin/src/app/(dashboard)/settings/integrations/integrations-view.tsx`
- Create: `apps/admin/src/app/(dashboard)/settings/integrations/slack-sheet.tsx`

**Interfaces:**
- Consumes: SDK `Integrations` class (Task 6); existing admin helpers `serverApi` pattern, `ensureConfigured`/`authHeaders`/`unwrap`/`expectOk` (`@/lib/api/server-call`), `requireManager` (`@/lib/auth/server-session`), `FormSheet`, `Field`, `ConfirmDialog`, `Button`, `Badge`, `Input`.
- Produces: types `Integration`, `IntegrationConnection`; `serverApi.listIntegrations()`, `serverApi.listIntegrationConnections()`; actions `createConnectionAction`, `updateConnectionAction`, `deleteConnectionAction`.

- [ ] **Step 1: Add the SDK-derived types**

In `apps/admin/src/lib/api/types.ts`, add `ListConnectionsResponse` and `ListIntegrationsResponse` to the type-import block from `@headless-lms/sdk`, then add after the `ConnectedApp` line:

```ts
// --- integrations ------------------------------------------------------------

export type Integration = ListIntegrationsResponse[number];
export type IntegrationConnection = ListConnectionsResponse[number];
export type IntegrationConnectionStatus = IntegrationConnection["status"];
```

- [ ] **Step 2: Add the server reads**

In `apps/admin/src/lib/api/server.ts`: add `Integrations` to the SDK import block, add `Integration, IntegrationConnection` to the types import, and add to `serverApi` (after the `listConnectedApps` entry):

```ts
  // integrations
  async listIntegrations(): Promise<Integration[]> {
    ensureConfigured();
    return unwrap(await Integrations.listIntegrations(await authHeaders()));
  },
  async listIntegrationConnections(): Promise<IntegrationConnection[]> {
    ensureConfigured();
    return unwrap(await Integrations.listConnections(await authHeaders()));
  },
```

- [ ] **Step 3: Add the nav entry**

In `apps/admin/src/app/(dashboard)/settings/settings-nav.tsx`: add `Blocks` to the lucide-react import, and in the `Organization` group's `items`, after the `Apps` entry:

```ts
      { href: "/settings/integrations", label: "Integrations", icon: Blocks },
```

- [ ] **Step 4: Write the server actions**

Create `apps/admin/src/app/(dashboard)/settings/integrations/actions.ts`:

```ts
"use server";

// Server actions for integration connections. Secrets pass through to the API
// and are never returned, logged, or cached.

import { revalidatePath } from "next/cache";
import { Integrations } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, unwrap, expectOk } from "@/lib/api/server-call";
import type { IntegrationConnection } from "@/lib/api/types";

export async function createConnectionAction(input: {
  integrationId: "slack";
  config: { channel: string };
  secrets: { botToken: string };
}): Promise<IntegrationConnection> {
  ensureConfigured();
  const connection = unwrap(
    await Integrations.createConnection({ body: input, ...(await authHeaders()) }),
  );
  revalidatePath("/settings/integrations");
  return connection;
}

export async function updateConnectionAction(
  id: string,
  input: {
    integrationId: "slack";
    config?: { channel: string };
    /** Omitted = keep the existing token; present = rotate it. */
    secrets?: { botToken: string };
    status?: "active" | "disabled";
  },
): Promise<IntegrationConnection> {
  ensureConfigured();
  const connection = unwrap(
    await Integrations.updateConnection({ path: { id }, body: input, ...(await authHeaders()) }),
  );
  revalidatePath("/settings/integrations");
  return connection;
}

export async function deleteConnectionAction(id: string): Promise<void> {
  ensureConfigured();
  expectOk(await Integrations.deleteConnection({ path: { id }, ...(await authHeaders()) }));
  revalidatePath("/settings/integrations");
}
```

- [ ] **Step 5: Write the page**

Create `apps/admin/src/app/(dashboard)/settings/integrations/page.tsx`:

```tsx
import { requireManager } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";

import { IntegrationsView } from "./integrations-view";

// Settings → Integrations (manager-only): the pre-built integration catalog
// with the org's connection state; connect/manage/disconnect flows.
export default async function IntegrationsSettingsPage() {
  // Start both fetches immediately, await the session gate, then the data —
  // the round-trips run in parallel instead of sequentially.
  const dataPromise = Promise.all([
    serverApi.listIntegrations(),
    serverApi.listIntegrationConnections(),
  ]);
  await requireManager(dataPromise);
  const [integrations, connections] = await dataPromise;

  return <IntegrationsView integrations={integrations} connections={connections} />;
}
```

- [ ] **Step 6: Write the view**

Create `apps/admin/src/app/(dashboard)/settings/integrations/integrations-view.tsx`:

```tsx
"use client";

import * as React from "react";
import { Blocks, Slack, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { Integration, IntegrationConnection } from "@/lib/api/types";

import { deleteConnectionAction } from "./actions";
import { SlackSheet } from "./slack-sheet";

// Integrations are pre-built: each catalog id maps to its icon here and its
// purpose-built sheet below. Adding one = a catalog row + an icon + a sheet.
const ICONS: Record<string, LucideIcon> = { slack: Slack };

export function IntegrationsView({
  integrations,
  connections,
}: {
  integrations: Integration[];
  connections: IntegrationConnection[];
}) {
  const [sheetFor, setSheetFor] = React.useState<Integration | null>(null);
  const [disconnectTarget, setDisconnectTarget] = React.useState<{
    integration: Integration;
    connection: IntegrationConnection;
  } | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const byIntegration = new Map(connections.map((c) => [c.integrationId, c]));

  const confirmDisconnect = React.useCallback(() => {
    if (!disconnectTarget) return;
    const target = disconnectTarget;
    startTransition(async () => {
      try {
        await deleteConnectionAction(target.connection.id);
        toast.success(`${target.integration.name} disconnected`);
        setDisconnectTarget(null);
      } catch (e) {
        toast.error("Couldn't disconnect", { description: (e as Error).message });
      }
    });
  }, [disconnectTarget]);

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-lg border border-border">
        <ul className="divide-y divide-border">
          {integrations.map((integration) => {
            const connection = byIntegration.get(integration.id);
            const Icon = ICONS[integration.id] ?? Blocks;
            return (
              <li key={integration.id} className="flex items-center gap-4 bg-surface px-4 py-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-2">
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-ink">{integration.name}</p>
                    {connection && (
                      <Badge variant={connection.status === "active" ? "success" : "neutral"}>
                        {connection.status === "active" ? "Connected" : "Disabled"}
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-sm text-ink-3">{integration.description}</p>
                </div>
                {connection ? (
                  <div className="flex shrink-0 gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setSheetFor(integration)}>
                      Manage
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDisconnectTarget({ integration, connection })}
                    >
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" className="shrink-0" onClick={() => setSheetFor(integration)}>
                    Connect
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <SlackSheet
        open={sheetFor?.id === "slack"}
        onOpenChange={(open) => !open && setSheetFor(null)}
        connection={sheetFor ? (byIntegration.get(sheetFor.id) ?? null) : null}
      />

      <ConfirmDialog
        open={!!disconnectTarget}
        onOpenChange={(open) => !open && setDisconnectTarget(null)}
        title={`Disconnect ${disconnectTarget?.integration.name ?? ""}`}
        description="The connection and its stored credentials are deleted immediately. You can reconnect at any time with a new token."
        confirmLabel="Disconnect"
        destructive
        pending={isPending}
        onConfirm={confirmDisconnect}
      />
    </div>
  );
}
```

- [ ] **Step 7: Write the Slack sheet**

Create `apps/admin/src/app/(dashboard)/settings/integrations/slack-sheet.tsx`:

```tsx
"use client";

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { FormSheet } from "@/components/forms/form-sheet";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { IntegrationConnection } from "@/lib/api/types";

import { createConnectionAction, updateConnectionAction } from "./actions";

const FORM_ID = "slack-connection-form";

const schema = z.object({
  channel: z.string().min(1, "Channel is required"),
  // Required on connect (enforced in submit — on manage, blank keeps the token).
  botToken: z.string(),
  status: z.enum(["active", "disabled"]),
});

type SlackValues = z.infer<typeof schema>;

export function SlackSheet({
  open,
  onOpenChange,
  connection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = connect flow; set = manage flow. */
  connection: IntegrationConnection | null;
}) {
  const isConnect = !connection;
  const [pending, startTransition] = React.useTransition();
  const existingChannel = connection
    ? ((connection.config as { channel?: string }).channel ?? "")
    : "";
  const existingStatus = connection?.status ?? "active";

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<SlackValues>({
    resolver: zodResolver(schema),
    defaultValues: { channel: existingChannel, botToken: "", status: existingStatus },
  });

  // Reset the form each time the sheet is (re)opened.
  React.useEffect(() => {
    if (open) reset({ channel: existingChannel, botToken: "", status: existingStatus });
  }, [open, existingChannel, existingStatus, reset]);

  const onSubmit = handleSubmit((values) => {
    if (isConnect && !values.botToken) {
      setError("botToken", { message: "Bot token is required" });
      return;
    }
    startTransition(async () => {
      try {
        if (isConnect) {
          await createConnectionAction({
            integrationId: "slack",
            config: { channel: values.channel },
            secrets: { botToken: values.botToken },
          });
          toast.success("Slack connected");
        } else {
          await updateConnectionAction(connection.id, {
            integrationId: "slack",
            config: { channel: values.channel },
            ...(values.botToken ? { secrets: { botToken: values.botToken } } : {}),
            status: values.status,
          });
          toast.success("Slack connection updated");
        }
        onOpenChange(false);
      } catch (e) {
        toast.error(isConnect ? "Couldn't connect Slack" : "Couldn't update connection", {
          description: (e as Error).message,
        });
      }
    });
  });

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isConnect ? "Connect Slack" : "Manage Slack"}
      description="A Slack bot posts messages to the channel you choose. Create a bot token with the chat:write scope under your Slack app's OAuth & Permissions."
      formId={FORM_ID}
      submitLabel={isConnect ? "Connect" : "Save changes"}
      pending={pending}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field
          id="slack-channel"
          label="Channel"
          required
          error={errors.channel?.message}
          hint="The channel the bot posts to, e.g. #general."
        >
          <Input
            id="slack-channel"
            placeholder="#general"
            autoComplete="off"
            aria-invalid={!!errors.channel}
            {...register("channel")}
          />
        </Field>

        <Field
          id="slack-bot-token"
          label="Bot token"
          required={isConnect}
          error={errors.botToken?.message}
          hint={
            isConnect
              ? "Starts with xoxb-. Stored encrypted; never shown again."
              : "Leave blank to keep the current token; paste a new one to rotate it."
          }
        >
          <Input
            id="slack-bot-token"
            type="password"
            autoComplete="off"
            placeholder="xoxb-…"
            aria-invalid={!!errors.botToken}
            {...register("botToken")}
          />
        </Field>

        {!isConnect && (
          <Field
            id="slack-status"
            label="Status"
            error={errors.status?.message}
            hint="Disabled connections keep their credentials but are skipped by callers."
          >
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="slack-status" aria-invalid={!!errors.status}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        )}
      </form>
    </FormSheet>
  );
}
```

- [ ] **Step 8: Typecheck + lint the admin app**

Run: `pnpm --filter admin typecheck && pnpm --filter admin lint`
Expected: both exit 0.

- [ ] **Step 9: Verify in the running app**

Run `pnpm dev`, open `http://localhost:8001/settings/integrations` (admin origin; log in as a manager):
- Slack appears in the list, not connected → **Connect** opens the sheet; submitting channel `#general` + a token creates the row (badge flips to Connected).
- **Manage** pre-fills the channel, token blank; saving with a blank token keeps it (PATCH body has no `secrets`).
- **Disconnect** confirms, deletes, list returns to unconnected.
- Confirm no response in the network tab ever contains `botToken`.

- [ ] **Step 10: Commit**

```bash
git add apps/admin/src/lib/api/types.ts apps/admin/src/lib/api/server.ts "apps/admin/src/app/(dashboard)/settings/settings-nav.tsx" "apps/admin/src/app/(dashboard)/settings/integrations"
git commit -m "feat(admin): settings/integrations page with slack connect flow

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Full verification

**Files:** none new.

- [ ] **Step 1: Run the full workspace gates**

Run, from the repo root of the worktree:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: all exit 0. If `gen:sdk` output drifted (someone changed a route after Task 6), re-run `pnpm gen:sdk` and commit the diff — a stale generated diff is an error by convention.

- [ ] **Step 2: Commit any stragglers**

```bash
git status --short
```

Expected: clean (or only intentional fixups, committed with a descriptive message).
