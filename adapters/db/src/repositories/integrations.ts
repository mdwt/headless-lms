// integrations — Drizzle repository (implements the core outbound port).
import { and, asc, eq } from "drizzle-orm";
import type { DbExecutor } from "../client.js";
import type { Connection, ConnectionsRepository } from "@headless-lms/core/integrations";
import { connections } from "../schema/integrations.js";
import type { Logger } from "@headless-lms/core/shared/ports";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { translateDbErrors } from "./pg-errors.js";

type Row = typeof connections.$inferSelect;

function toConnection(row: Row): Connection {
  return {
    orgId: row.orgId,
    id: row.id,
    integrationId: row.integrationId,
    config: row.config,
    active: row.active,
    credentialRef: row.credentialRef,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleConnectionsRepository implements ConnectionsRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly logger: Logger = noopLogger,
  ) {}

  async insert(orgId: string, connection: Connection): Promise<Connection> {
    if (connection.orgId !== orgId) {
      throw new Error("connection org mismatch");
    }
    const [row] = await this.db
      .insert(connections)
      .values({
        orgId: connection.orgId,
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
      throw new Error("failed to insert connection");
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
    patch: Partial<Pick<Connection, "config" | "active" | "updatedAt">>,
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
translateDbErrors(DrizzleConnectionsRepository);
