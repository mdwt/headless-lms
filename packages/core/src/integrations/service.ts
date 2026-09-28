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
// outbox relay — not this service — publishes to the EventBus.
import { genId } from '../shared/id.js';
import {
  ActionInvocationError,
  AlreadyConnectedError,
  InvalidConfigError,
  UnknownIntegrationError,
  type ConfigureInput,
  type ConnectInput,
  type Connection,
} from './model.js';
import type {
  ConnectionsRepository,
  IntegrationsRegistry,
  IntegrationsService,
  IntegrationsUnitOfWork,
} from './ports.js';
import type { CredentialStore, Logger } from '../shared/ports.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { noopLogger } from '../shared/logger.js';
import { integrationEvents } from './events.js';

export type IntegrationsServiceParams = {
  registry: IntegrationsRegistry;
  /** Read-only access (find/list) — runs outside any transaction. */
  repo: ConnectionsRepository;
  /** Atomic write scope: tx-bound connections repo + credential store + outbox. */
  uow: IntegrationsUnitOfWork;
  /** Point-of-use credential reveal for action invocation — reads only. */
  credentials: CredentialStore;
  logger?: Logger;
};

export class IntegrationsServiceImpl implements IntegrationsService {
  private readonly registry: IntegrationsRegistry;
  private readonly repo: ConnectionsRepository;
  private readonly uow: IntegrationsUnitOfWork;
  private readonly credentials: CredentialStore;
  private readonly logger: Logger;

  constructor(params: IntegrationsServiceParams) {
    this.registry = params.registry;
    this.repo = params.repo;
    this.uow = params.uow;
    this.credentials = params.credentials;
    this.logger = params.logger ?? noopLogger;
  }

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
    if (!integration) {
      this.logger.warn('unknown integration rejected', { integrationId });
      throw new UnknownIntegrationError(integrationId);
    }
    const result = integration.validateConfig(config);
    if (!result.ok) {
      this.logger.warn('invalid integration config rejected', {
        integrationId,
        errors: result.errors,
      });
      throw new InvalidConfigError(integrationId, result.errors);
    }
  }

  async connect(orgId: string, input: ConnectInput): Promise<Connection> {
    const config = input.config ?? {};
    this.validate(input.integrationId, config);
    const existing = await this.repo.findByIntegration(orgId, input.integrationId);
    if (existing) {
      this.logger.warn('duplicate connection rejected', {
        orgId,
        integrationId: input.integrationId,
      });
      throw new AlreadyConnectedError(input.integrationId);
    }
    const connection = await this.uow.run(async ({ connections, credentials, outbox }) => {
      const credentialRef = await credentials.store(orgId, input.secrets);
      const at = new Date();
      const created = await connections.insert(orgId, {
        orgId,
        id: genId('connection'),
        integrationId: input.integrationId,
        config,
        active: true,
        credentialRef,
        createdAt: at,
        updatedAt: at,
      });
      await outbox.append([
        integrationEvents.connectionCreated.make({
          orgId,
          data: created,
        }),
      ]);
      return created;
    });
    this.logger.info('integration connected', {
      orgId,
      integrationId: connection.integrationId,
      connectionId: connection.id,
    });
    return connection;
  }

  async reconnect(
    orgId: string,
    id: string,
    secrets: Record<string, unknown>,
  ): Promise<Connection | null> {
    const connection = await this.repo.findById(orgId, id);
    if (!connection) {
      return null;
    }
    const updated = await this.uow.run(async ({ connections, credentials, outbox }) => {
      await credentials.update(orgId, connection.credentialRef, secrets);
      const result = await connections.update(orgId, id, { updatedAt: new Date() });
      if (result) {
        await outbox.append([integrationEvents.connectionUpdated.make({ orgId, data: result })]);
      }
      return result;
    });
    this.logger.info('integration credentials rotated', {
      orgId,
      connectionId: id,
      integrationId: connection.integrationId,
    });
    return updated;
  }

  async configure(orgId: string, id: string, input: ConfigureInput): Promise<Connection | null> {
    const connection = await this.repo.findById(orgId, id);
    if (!connection) {
      return null;
    }
    if (input.config !== undefined) {
      this.validate(connection.integrationId, input.config);
    }
    const updated = await this.uow.run(async ({ connections, outbox }) => {
      const result = await connections.update(orgId, id, {
        ...(input.config !== undefined ? { config: input.config } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        updatedAt: new Date(),
      });
      if (result) {
        await outbox.append([integrationEvents.connectionUpdated.make({ orgId, data: result })]);
      }
      return result;
    });
    this.logger.info('integration configured', {
      orgId,
      connectionId: id,
      integrationId: connection.integrationId,
    });
    return updated;
  }

  async disconnect(orgId: string, id: string): Promise<boolean> {
    const connection = await this.repo.findById(orgId, id);
    if (!connection) {
      return false;
    }
    const deleted = await this.uow.run(async ({ connections, credentials, outbox }) => {
      // Connection first: it holds the FK onto the credential row.
      const ok = await connections.delete(orgId, id);
      await credentials.destroy(orgId, connection.credentialRef);
      await outbox.append([integrationEvents.connectionRemoved.make({ orgId, data: connection })]);
      return ok;
    });
    this.logger.info('integration disconnected', {
      orgId,
      connectionId: id,
      integrationId: connection.integrationId,
    });
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

  async invoke(
    orgId: string,
    connectionId: string,
    actionId: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const connection = await this.repo.findById(orgId, connectionId);
    if (!connection) {
      throw new NotFoundError('Connection', connectionId);
    }
    if (!connection.active) {
      throw new ConflictError(`connection "${connectionId}" is inactive`);
    }
    const integration = this.registry.get(connection.integrationId);
    if (!integration) {
      throw new UnknownIntegrationError(connection.integrationId);
    }
    const action = integration.actions.find((a) => a.id === actionId);
    if (!action) {
      throw new NotFoundError('Action', actionId);
    }
    const secrets = await this.credentials.reveal(orgId, connection.credentialRef);
    if (!secrets) {
      throw new NotFoundError('Credential', connectionId);
    }
    try {
      return await action.invoke({ secrets, config: connection.config }, input);
    } catch (err) {
      this.logger.warn('integration action failed', {
        orgId,
        connectionId,
        integrationId: connection.integrationId,
        actionId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new ActionInvocationError(connection.integrationId, actionId, err);
    }
  }
}
