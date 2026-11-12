import { and, eq, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { OrgHostIndex } from "@headless-lms/core/organizations";
import { SettingsNamespace } from "@headless-lms/core/shared/settings";
import { settings } from "../schema/settings.js";
import { translateDbErrors } from "./pg-errors.js";

export class DrizzleOrgHostIndex implements OrgHostIndex {
  constructor(private readonly db: NodePgDatabase) {}

  async findOrgIdsByHost(host: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ orgId: settings.orgId })
      .from(settings)
      .where(
        and(
          eq(settings.namespace, SettingsNamespace.organizations),
          or(
            sql`(${settings.value} #>> '{hosts,courses}') = ${host}`,
            sql`(${settings.value} #>> '{hosts,community}') = ${host}`,
          ),
        ),
      );
    return rows.map((row) => row.orgId);
  }
}
translateDbErrors(DrizzleOrgHostIndex);
