import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { DevicesRepository, NewDevice } from "@headless-lms/core/identity";
import type { DeviceView, Logger } from "@headless-lms/core/types";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { devices } from "../schema/index.js";
import { translateDbErrors } from "./pg-errors.js";

type Row = typeof devices.$inferSelect;

function toDevice(row: Row): DeviceView {
  return {
    id: row.id,
    provider: row.provider,
    token: row.token,
    p256dh: row.p256dh,
    auth: row.auth,
    appId: row.appId,
    environment: row.environment,
    lastSeenAt: row.lastSeenAt,
  };
}

export class DrizzleDevicesRepository implements DevicesRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async upsert(orgId: string, device: NewDevice, at: Date): Promise<DeviceView> {
    const [row] = await this.db
      .insert(devices)
      .values({ orgId, ...device, createdAt: at, lastSeenAt: at })
      .onConflictDoUpdate({
        target: [devices.orgId, devices.provider, devices.token],
        set: {
          userId: device.userId,
          p256dh: device.p256dh,
          auth: device.auth,
          appId: device.appId,
          environment: device.environment,
          lastSeenAt: at,
        },
      })
      .returning();
    if (!row) {
      throw new Error("device upsert returned no row");
    }
    this.logger.debug("device upserted", { orgId, deviceId: row.id });
    return toDevice(row);
  }

  async listForUser(orgId: string, userId: string, since: Date | null): Promise<DeviceView[]> {
    const conditions = [eq(devices.orgId, orgId), eq(devices.userId, userId)];
    if (since) {
      conditions.push(gte(devices.lastSeenAt, since));
    }
    const rows = await this.db
      .select()
      .from(devices)
      .where(and(...conditions))
      .orderBy(desc(devices.lastSeenAt), asc(devices.id));
    return rows.map(toDevice);
  }

  async usersWithDevices(orgId: string, userIds: string[], since: Date): Promise<string[]> {
    if (userIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .selectDistinct({ userId: devices.userId })
      .from(devices)
      .where(
        and(
          eq(devices.orgId, orgId),
          inArray(devices.userId, userIds),
          gte(devices.lastSeenAt, since),
        ),
      );
    return rows.map((row) => row.userId);
  }

  async deleteOwn(orgId: string, userId: string, deviceId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(devices)
      .where(and(eq(devices.orgId, orgId), eq(devices.userId, userId), eq(devices.id, deviceId)))
      .returning({ id: devices.id });
    return deleted.length > 0;
  }

  async deleteMany(orgId: string, deviceIds: string[]): Promise<void> {
    if (deviceIds.length === 0) {
      return;
    }
    await this.db
      .delete(devices)
      .where(and(eq(devices.orgId, orgId), inArray(devices.id, deviceIds)));
  }
}
translateDbErrors(DrizzleDevicesRepository);
