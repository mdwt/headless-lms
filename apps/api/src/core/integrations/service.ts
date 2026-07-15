// integrations context — service implementation (inbound port). Owns the
// connection lifecycle; credentials live in the shared secure credential store
// (this service holds only the ref). The integrations the system supports are
// declared at startup via the IntegrationsRegistry: connect/configure reject
// unknown integration ids and validate config with the integration's own
// validator. The domain never calls the external service — consumers take the
// connection, reveal the credential at point of use, and build their own adapter.
import { genId } from "../shared/id.js";
import type { CredentialStore, EventBus } from "../shared/ports.js";
import { AlreadyConnectedError, InvalidConfigError, UnknownIntegrationError } from "./model.js";
import type { ConfigureInput, ConnectInput, Connection } from "./model.js";
import type { ConnectionsRepository, IntegrationsRegistry, IntegrationsService } from "./ports.js";
import type { ConnectionCreated, ConnectionRemoved, ConnectionUpdated } from "./events.js";

export class IntegrationsServiceImpl implements IntegrationsService {
  constructor(
    private readonly registry: IntegrationsRegistry,
    private readonly repo: ConnectionsRepository,
    private readonly credentials: CredentialStore,
    private readonly events: EventBus,
    private readonly now: () => string,
  ) {}

  available() {
    return this.registry.list().map((integration) => ({
      id: integration.id,
      configSchema: integration.configSchema(),
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
    const credentialRef = await this.credentials.store(orgId, input.secrets);
    const at = this.now();
    const connection = await this.repo.insert(orgId, {
      id: genId("connection"),
      integrationId: input.integrationId,
      config,
      active: true,
      credentialRef,
      createdAt: at,
      updatedAt: at,
    });
    const created: ConnectionCreated = {
      type: "connection.created",
      orgId,
      connectionId: connection.id,
      integrationId: connection.integrationId,
    };
    await this.events.publish(created);
    return connection;
  }

  async reconnect(
    orgId: string,
    id: string,
    secrets: Record<string, unknown>,
  ): Promise<Connection | null> {
    const connection = await this.repo.findById(orgId, id);
    if (!connection) return null;
    await this.credentials.update(orgId, connection.credentialRef, secrets);
    const updated = await this.repo.update(orgId, id, { updatedAt: this.now() });
    const updatedEvent: ConnectionUpdated = {
      type: "connection.updated",
      orgId,
      connectionId: id,
      integrationId: connection.integrationId,
      changed: "credentials",
    };
    await this.events.publish(updatedEvent);
    return updated;
  }

  async configure(orgId: string, id: string, input: ConfigureInput): Promise<Connection | null> {
    const connection = await this.repo.findById(orgId, id);
    if (!connection) return null;
    if (input.config !== undefined) this.validate(connection.integrationId, input.config);
    const updated = await this.repo.update(orgId, id, {
      ...(input.config !== undefined ? { config: input.config } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      updatedAt: this.now(),
    });
    const configuredEvent: ConnectionUpdated = {
      type: "connection.updated",
      orgId,
      connectionId: id,
      integrationId: connection.integrationId,
      changed: "configuration",
    };
    await this.events.publish(configuredEvent);
    return updated;
  }

  async disconnect(orgId: string, id: string): Promise<boolean> {
    const connection = await this.repo.findById(orgId, id);
    if (!connection) return false;
    await this.credentials.destroy(orgId, connection.credentialRef);
    const deleted = await this.repo.delete(orgId, id);
    const removed: ConnectionRemoved = {
      type: "connection.removed",
      orgId,
      connectionId: id,
      integrationId: connection.integrationId,
    };
    await this.events.publish(removed);
    return deleted;
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
