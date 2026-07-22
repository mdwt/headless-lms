// integrations context — service implementation (inbound port). Owns the
// connection lifecycle; credentials live in the shared secure credential store
// (this service holds only the ref). The integrations the system supports are
// declared at startup via the IntegrationsRegistry: connect/configure reject
// unknown integration ids and validate config with the integration's own
// validator. The domain never calls the external service — consumers take the
// connection, reveal the credential at point of use, and build their own adapter.
//
// Mutations run inside the context's UnitOfWork: credential writes, connection
// writes, and the outbox append commit in ONE transaction (transactional
// outbox; this also closed the historical orphan-credential window). The
// outbox relay — not this service — publishes to EventBus subscribers.
import { genId } from "../shared/id.js";
import { AlreadyConnectedError, InvalidConfigError, UnknownIntegrationError } from "./model.js";
import type { ConfigureInput, ConnectInput, Connection } from "./model.js";
import type {
  ConnectionsRepository,
  IntegrationsRegistry,
  IntegrationsService,
  IntegrationsUnitOfWork,
} from "./ports.js";

export class IntegrationsServiceImpl implements IntegrationsService {
  constructor(
    private readonly registry: IntegrationsRegistry,
    /** Read-only access (find/list) — runs outside any transaction. */
    private readonly repo: ConnectionsRepository,
    /** Atomic write scope: tx-bound connections repo + credential store + outbox. */
    private readonly uow: IntegrationsUnitOfWork,
    private readonly now: () => string,
  ) {}

  available() {
    return this.registry.list().map((integration) => ({
      id: integration.id,
      configSchema: integration.configSchema(),
      secretsSchema: integration.secretsSchema(),
      actions: integration.actions.map((action) => ({
        id: action.id,
        description: action.description,
        inputSchema: action.inputSchema(),
        outputSchema: action.outputSchema(),
      })),
    }));
  }

  private validate(integrationId: string, config: Record<string, unknown>): void {
    const integration = this.registry.get(integrationId);
    if (!integration) throw new UnknownIntegrationError(integrationId);
    const result = integration.validateConfig(config);
    if (!result.ok) throw new InvalidConfigError(integrationId, result.errors);
  }

  async connect(orgId: string, input: ConnectInput): Promise<Connection> {
    const config = input.config ?? {};
    this.validate(input.integrationId, config);
    const existing = await this.repo.findByIntegration(orgId, input.integrationId);
    if (existing) throw new AlreadyConnectedError(input.integrationId);
    return this.uow.run(async ({ connections, credentials, outbox }) => {
      const credentialRef = await credentials.store(orgId, input.secrets);
      const at = this.now();
      const connection = await connections.insert(orgId, {
        id: genId("connection"),
        integrationId: input.integrationId,
        config,
        active: true,
        credentialRef,
        createdAt: at,
        updatedAt: at,
      });
      await outbox.append([
        {
          type: "connection.created",
          orgId,
          connectionId: connection.id,
          integrationId: connection.integrationId,
        },
      ]);
      return connection;
    });
  }

  async reconnect(
    orgId: string,
    id: string,
    secrets: Record<string, unknown>,
  ): Promise<Connection | null> {
    const connection = await this.repo.findById(orgId, id);
    if (!connection) return null;
    return this.uow.run(async ({ connections, credentials, outbox }) => {
      await credentials.update(orgId, connection.credentialRef, secrets);
      const updated = await connections.update(orgId, id, { updatedAt: this.now() });
      await outbox.append([
        {
          type: "connection.updated",
          orgId,
          connectionId: id,
          integrationId: connection.integrationId,
          changed: "credentials",
        },
      ]);
      return updated;
    });
  }

  async configure(orgId: string, id: string, input: ConfigureInput): Promise<Connection | null> {
    const connection = await this.repo.findById(orgId, id);
    if (!connection) return null;
    if (input.config !== undefined) this.validate(connection.integrationId, input.config);
    return this.uow.run(async ({ connections, outbox }) => {
      const updated = await connections.update(orgId, id, {
        ...(input.config !== undefined ? { config: input.config } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        updatedAt: this.now(),
      });
      await outbox.append([
        {
          type: "connection.updated",
          orgId,
          connectionId: id,
          integrationId: connection.integrationId,
          changed: "configuration",
        },
      ]);
      return updated;
    });
  }

  async disconnect(orgId: string, id: string): Promise<boolean> {
    const connection = await this.repo.findById(orgId, id);
    if (!connection) return false;
    return this.uow.run(async ({ connections, credentials, outbox }) => {
      // Connection first: it holds the FK onto the credential row.
      const deleted = await connections.delete(orgId, id);
      await credentials.destroy(orgId, connection.credentialRef);
      await outbox.append([
        {
          type: "connection.removed",
          orgId,
          connectionId: id,
          integrationId: connection.integrationId,
        },
      ]);
      return deleted;
    });
  }

  list(orgId: string): Promise<Connection[]> {
    return this.repo.list(orgId);
  }

  get(orgId: string, id: string): Promise<Connection | null> {
    return this.repo.findById(orgId, id);
  }

  getByIntegration(orgId: string, integrationId: string): Promise<Connection | null> {
    return this.repo.findByIntegration(orgId, integrationId);
  }
}
