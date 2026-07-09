# Integrations Domain — Implementation Design

Implements `docs/domain/integrations.md`: the seventh core context, `integrations`, plus the shared secure secret store it depends on, the HTTP/contract/SDK surface, and an admin settings page. Seeded with one integration — Slack, for a bot that posts to a channel.

## Vocabulary

- **Integration** — a pre-built catalog entry describing a service the platform can connect to (e.g. Slack). Global, not org-scoped. Rows are seeded; adding one is a code-and-seed change.
- **Connection** — an org's authenticated link to one integration: its non-secret config, its status, and a reference to its secret. Org-scoped. At most one connection per integration per org.
- **Secret** — an encrypted, org-scoped, immutable blob in the shared secret store. Rotation is delete-and-create, never update.

## 1. Data model (`apps/api/src/adapters/db/schema/`)

Three tables, following the repo's existing conventions (text ids via `genId`, composite `(org_id, id)` PKs on org-scoped tables).

**`integrations`** — the catalog. Global.

| column | type | notes |
|---|---|---|
| `key` | text PK | e.g. `"slack"` |
| `name` | text | display name |
| `description` | text | shown on the admin page |
| `enabled` | boolean, default true | hidden from the catalog when false |

Seeded with Slack in the migration that creates it.

**`connections`** — org-scoped.

| column | type | notes |
|---|---|---|
| `org_id` | text, FK → `organizations.id` | composite PK part |
| `id` | text, `genId("connection")` | composite PK part |
| `integration_key` | text, FK → `integrations.key` | |
| `config` | jsonb | non-secret config (Slack: `{ channel }`) |
| `secret_id` | text | reference into the secret store |
| `status` | text enum `active \| disabled`, default `active` | |
| `created_at`, `updated_at` | timestamp | |

Unique `(org_id, integration_key)` — one connection per integration per org.

**`secrets`** — org-scoped, owned exclusively by the SecretStore adapter. Nothing else reads or writes it.

| column | type | notes |
|---|---|---|
| `org_id` | text, FK → `organizations.id` | composite PK part |
| `id` | text, `genId("secret")` | composite PK part |
| `ciphertext` | text | base64 |
| `iv` | text | base64, per-secret random |
| `auth_tag` | text | base64, GCM auth tag |
| `created_at` | timestamp | |

## 2. SecretStore — shared port

A generic encrypted-storage port in `core/shared/ports.ts`. Credentials are only this context's use of it; any domain may store any JSON value.

```ts
export interface SecretStore {
  /** Encrypt and persist a value; returns the secret id. */
  put(orgId: string, value: Record<string, unknown>): Promise<string>;
  /** Decrypt at point of use. Null if absent. */
  get(orgId: string, id: string): Promise<Record<string, unknown> | null>;
  /** Permanently remove. */
  remove(orgId: string, id: string): Promise<void>;
}
```

Secrets are immutable — no update. Rotation = `put` new + repoint caller's reference + `remove` old.

**Adapter:** `adapters/db/secret-store.ts` (Drizzle-backed, like the other db adapters). AES-256-GCM; 32-byte key from env `SECRETS_ENCRYPTION_KEY` (base64); fresh random IV per secret; auth tag verified on decrypt, so a wrong key or tampered ciphertext throws rather than returning garbage. Decryption happens only inside `get`. Org scoping is structural: every operation keys on `(org_id, id)`.

## 3. Core context — `core/integrations/`

Standard context file contract: `model.ts`, `ports.ts`, `service.ts`, `index.ts`, `service.test.ts`. Framework-free, persistence-free; imports only `core/shared`.

**Models** (`model.ts`):

```ts
export interface Integration {
  key: string;
  name: string;
  description: string;
}

export type ConnectionStatus = "active" | "disabled";

export interface Connection {
  readonly id: string;
  integrationKey: string;
  config: Record<string, unknown>;
  status: ConnectionStatus;
  secretId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectInput {
  integrationKey: string;
  config: Record<string, unknown>;
  secrets: Record<string, unknown>;
}

export interface UpdateConnectionInput {
  config?: Record<string, unknown>;
  secrets?: Record<string, unknown>; // omitted = keep existing secret
  status?: ConnectionStatus;
}
```

Core holds config and secrets as opaque records; per-integration shapes are validated at the HTTP boundary by the contract's Zod schemas.

**Inbound port** (`IntegrationsService`):

- `listIntegrations()` — enabled catalog entries.
- `listConnections(orgId)` — the org's connections (no secrets).
- `connect(orgId, input)` — verifies the integration exists and the org isn't already connected to it; `SecretStore.put` the secrets; insert the connection; publish `connection.created`.
- `update(orgId, id, input)` — patch config/status; if `secrets` present, rotate (put new → repoint `secretId` → remove old); publish `connection.updated`.
- `disconnect(orgId, id)` — delete the connection, then `SecretStore.remove` its secret; publish `connection.removed`.
- `getConnection(orgId, integrationKey)` — connection **with decrypted secrets**, for internal callers (billing, automations, workers). Never exposed over HTTP. The caller builds its own adapter from it; this domain never calls the external service.

**Outbound port** (`IntegrationsRepository`): reads on `integrations`, CRUD on `connections`. `SecretStore` and `EventBus` are injected separately (constructor: `repo`, `secretStore`, `eventBus`, `now`).

**Events** (per the domain spec): `connection.created`, `connection.updated`, `connection.removed`, published on the shared `EventBus`, carrying `orgId`, `connectionId`, `integrationKey` — never secrets.

**Wiring:** `composition/container.ts` gains `secretStore` (adapter) and `integrations` (service); `SECRETS_ENCRYPTION_KEY` joins `Config` and the server's env reading.

## 4. HTTP + contract + SDK

**Contract** (`packages/api-contract/src/integrations.ts`), tag `Integrations`:

- `Integration` — `{ key, name, description }`.
- `Connection` — `{ id, integrationKey, config, status, createdAt, updatedAt }`. **No secrets, ever** — secrets are write-only over HTTP.
- Per-integration Zod shapes, discriminated on `integration` so the SDK gives admin typed forms:

```ts
export const SlackConfig = z.object({ channel: z.string().min(1) });
export const SlackSecrets = z.object({ botToken: z.string().min(1) });

export const ConnectConnection = z.discriminatedUnion("integration", [
  z.object({ integration: z.literal("slack"), config: SlackConfig, secrets: SlackSecrets }),
]);

export const UpdateConnection = z.discriminatedUnion("integration", [
  z.object({
    integration: z.literal("slack"),
    config: SlackConfig.optional(),
    secrets: SlackSecrets.optional(), // omitted = keep existing token
    status: z.enum(["active", "disabled"]).optional(),
  }),
]);
```

Adding an integration later = one arm per union + a catalog row.

**Routes** (`apps/api/src/http/routes/integrations.ts`), entitlements pattern — `requireSession`, `resolveScope`, `ErrorBody` on failures:

| method + path | operationId | behavior |
|---|---|---|
| `GET /api/integrations` | `listIntegrations` | catalog |
| `GET /api/integrations/connections` | `listConnections` | org's connections |
| `POST /api/integrations/connections` | `createConnection` | 201; 409 if the org already has a connection for that integration |
| `PATCH /api/integrations/connections/:id` | `updateConnection` | 200; 404 if absent |
| `DELETE /api/integrations/connections/:id` | `deleteConnection` | 204; 404 if absent |

Registered in `server.ts`; then `pnpm gen:sdk` regenerates `openapi.json` + the `Integrations` SDK class (both committed).

## 5. Admin — `/settings/integrations`

Under the existing settings section of `apps/admin`, following the settings pages' layout and the repo's server-loaded pattern (`lib/api/server.ts` + SDK).

- **Page** (server component): loads the catalog and the org's connections; renders each integration with its connection state (connected — with channel and status — or not connected).
- **Connect CTA** — opens a Slack-specific form: channel + bot token. Typed off the SDK's `ConnectConnection` shape. Submits `POST /api/integrations/connections`.
- **Update CTA** — edit channel and status; bot token field blank by default, filling it rotates the token (omitted = kept). Submits `PATCH`.
- **Disconnect CTA** — confirm dialog, then `DELETE`.

Forms are per-integration by design — good UX now, no generic form machinery. Slack is the only one in v1.

## 6. Error handling

- Connect against an unknown/disabled integration key → 400 (contract union already rejects unknown keys; core re-checks against the catalog).
- Connect when already connected → 409 (`already_connected`), backed by the unique `(org_id, integration_key)` index.
- Update/disconnect a missing connection → 404.
- `SECRETS_ENCRYPTION_KEY` missing or not 32 bytes → the SecretStore adapter throws at construction; the server fails to boot rather than running unencrypted.
- Decrypt failure (tamper/wrong key) → surfaces as an error to the internal caller; never silently returns partial data.
- Cross-org access is impossible by construction: every query and every secret operation is keyed by the resolved scope's `orgId`.

## 7. Testing

- `core/integrations/service.test.ts` — in-memory repo + fake SecretStore + capturing EventBus: connect happy path; duplicate connect rejected; update with/without secret rotation (old secret removed, new referenced); disconnect removes connection and secret; `getConnection` returns decrypted secrets; events published with no secret material.
- `adapters/db/secret-store.test.ts` — crypto unit tests with no DB (in-memory rows): put/get roundtrip; tampered ciphertext and wrong key throw; distinct IVs per put; invalid key length rejected at construction.
- Contract shapes are exercised by Fastify's request/response validation; no separate route tests, matching the repo (only service-level tests exist per context).

## 8. Delivery checkpoints

1. SecretStore port + adapter + tests.
2. Schema (3 tables) + migration with Slack seed row.
3. Core context + repository + container wiring + tests.
4. Contract + routes + `pnpm gen:sdk`.
5. Admin `/settings/integrations` page.

Each step leaves `pnpm test`, `pnpm lint`, `pnpm typecheck` green.
