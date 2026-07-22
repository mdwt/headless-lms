// integrations — Drizzle repository (implements the core outbound port).
import { and, asc, eq } from 'drizzle-orm';
import type { DbExecutor } from '../index.js';
import type { ConnectionsRepository } from '../../../core/integrations/ports.js';
import type { Connection } from '../../../core/integrations/model.js';
import { connections } from '../schema/integrations.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';

type Row = typeof connections.$inferSelect;

function toConnection(row: Row): Connection {
  return {
    id: row.id,
    integrationId: row.integrationId,
    config: row.config,
    active: row.active,
    credentialRef: row.credentialRef,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class DrizzleConnectionsRepository implements ConnectionsRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly logger: Logger = noopLogger,
  ) {}

  async insert(orgId: string, connection: Connection): Promise<Connection> {
    const [row] = await this.db
      .insert(connections)
      .values({
        orgId,
        id: connection.id,
        integrationId: connection.integrationId,
        config: connection.config,
        active: connection.active,
        credentialRef: connection.credentialRef,
        createdAt: new Date(connection.createdAt),
        updatedAt: new Date(connection.updatedAt),
      })
      .returning();
    if (!row) {
      throw new Error('failed to insert connection');
    }
    return toConnection(row);
  }

  async findById(orgId: string, id: string): Promise<Connection | null> {
    const [row] = await this.db
      .select()
      .from(connections)
      .where(and(eq(connections.orgId, orgId), eq(connections.id, id)))
      .limit(1);
    return row ? toConnection(row) : null;
  }

  async findByIntegration(orgId: string, integrationId: string): Promise<Connection | null> {
    const [row] = await this.db
      .select()
      .from(connections)
      .where(and(eq(connections.orgId, orgId), eq(connections.integrationId, integrationId)))
      .limit(1);
    return row ? toConnection(row) : null;
  }

  async list(orgId: string): Promise<Connection[]> {
    const rows = await this.db
      .select()
      .from(connections)
      .where(eq(connections.orgId, orgId))
      .orderBy(asc(connections.integrationId));
    return rows.map(toConnection);
  }

  async update(
    orgId: string,
    id: string,
    patch: Partial<Pick<Connection, 'config' | 'active' | 'updatedAt'>>,
  ): Promise<Connection | null> {
    const [row] = await this.db
      .update(connections)
      .set({
        ...(patch.config !== undefined ? { config: patch.config } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
        ...(patch.updatedAt !== undefined ? { updatedAt: new Date(patch.updatedAt) } : {}),
      })
      .where(and(eq(connections.orgId, orgId), eq(connections.id, id)))
      .returning();
    return row ? toConnection(row) : null;
  }

  async delete(orgId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(connections)
      .where(and(eq(connections.orgId, orgId), eq(connections.id, id)))
      .returning({ id: connections.id });
    return deleted.length > 0;
  }
}
