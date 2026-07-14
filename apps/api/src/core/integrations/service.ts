// integrations context — service implementation (inbound port). Owns the
// connection lifecycle; credentials live in the shared secure credential store
// (this service holds only the ref). It never calls the external service —
// consumers take the connection, reveal the credential at point of use, and
// build their own adapter.
import { genId } from "../shared/id.js";
import type { CredentialStore, EventBus } from "../shared/ports.js";
import { AlreadyConnectedError } from "./model.js";
import type { ConfigureInput, ConnectInput, Connection } from "./model.js";
import type { ConnectionCreated, ConnectionRemoved, ConnectionUpdated } from "./events.js";
import type { ConnectionsRepository, IntegrationsService } from "./ports.js";

export class IntegrationsServiceImpl implements IntegrationsService {
  constructor(
    private readonly repo: ConnectionsRepository,
    private readonly credentials: CredentialStore,
    private readonly events: EventBus,
    private readonly now: () => string,
  ) {}

  async connect(orgId: string, input: ConnectInput): Promise<Connection> {
    const existing = await this.repo.findByService(orgId, input.service);
    if (existing) throw new AlreadyConnectedError(input.service);
    const credentialRef = await this.credentials.store(orgId, input.credential);
    const at = this.now();
    const connection = await this.repo.insert(orgId, {
      id: genId("connection"),
      service: input.service,
      config: input.config ?? {},
      active: true,
      credentialRef,
      createdAt: at,
      updatedAt: at,
    });
    const created: ConnectionCreated = {
      type: "connection.created",
      orgId,
      connectionId: connection.id,
      service: connection.service,
    };
    await this.events.publish(created);
    return connection;
  }

  async reconnect(orgId: string, id: string, credential: string): Promise<Connection | null> {
    const connection = await this.repo.findById(orgId, id);
    if (!connection) return null;
    await this.credentials.update(orgId, connection.credentialRef, credential);
    const updated = await this.repo.update(orgId, id, { updatedAt: this.now() });
    const updatedEvent: ConnectionUpdated = {
      type: "connection.updated",
      orgId,
      connectionId: id,
      service: connection.service,
      changed: "credentials",
    };
    await this.events.publish(updatedEvent);
    return updated;
  }

  async configure(orgId: string, id: string, input: ConfigureInput): Promise<Connection | null> {
    const connection = await this.repo.findById(orgId, id);
    if (!connection) return null;
    const updated = await this.repo.update(orgId, id, {
      ...(input.config !== undefined ? { config: input.config } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      updatedAt: this.now(),
    });
    const configuredEvent: ConnectionUpdated = {
      type: "connection.updated",
      orgId,
      connectionId: id,
      service: connection.service,
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
      service: connection.service,
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

  getByService(orgId: string, service: string): Promise<Connection | null> {
    return this.repo.findByService(orgId, service);
  }
}
